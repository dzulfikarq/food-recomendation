import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import test from "node:test";
import "@/tests/helpers/test-database";

test("USER rating lifecycle, private rating history, and ADMIN dataset CSV snapshot", async () => {
  Reflect.set(process.env, "NODE_ENV", "production");
  Reflect.set(process.env, "AUTH_URL", "http://127.0.0.1:3103");
  const [{ default: next }, { hashPassword }, { readApplicationEnvironment }, { prisma }] = await Promise.all([
    import("next"),
    import("better-auth/crypto"),
    import("@/lib/env"),
    import("@/lib/prisma")
  ]);
  const env = readApplicationEnvironment();
  const baseUrl = env.AUTH_URL;
  const email = `rating-user-${randomUUID()}@example.test`;
  const password = "rating-integration-password";
  let userId: number | undefined;
  let foodId: number | undefined;

  const app = next({ dev: false, hostname: "127.0.0.1", port: 3103 });
  await app.prepare();
  const server = createServer(app.getRequestHandler());
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(3103, "127.0.0.1", resolve);
  });

  const page = (path: string, cookie?: string) => fetch(`${baseUrl}${path}`, { headers: cookie ? { cookie } : undefined, redirect: "manual" });
  const api = (path: string, method = "GET", body?: unknown, cookie?: string) => fetch(`${baseUrl}${path}`, {
    method,
    headers: { origin: baseUrl, ...(body === undefined ? {} : { "content-type": "application/json" }), ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "manual"
  });
  const cookiesFrom = (response: Response) => response.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");

  try {
    assert.equal((await page("/foods")).status, 200);
    assert.equal((await page("/my-ratings")).status, 307);
    assert.equal((await api("/api/my-ratings")).status, 401);

    const user = await prisma.user.create({ data: { name: "Rating Integration User", email, emailVerified: true } });
    userId = user.id;
    await prisma.account.create({ data: { accountId: String(user.id), providerId: "credential", userId: user.id, password: await hashPassword(password) } });
    const login = await api("/api/auth/sign-in/email", "POST", { email, password });
    assert.equal(login.status, 200);
    const userCookie = cookiesFrom(login);

    const food = await prisma.food.create({ data: {
      foodCode: `TEST-RATE-${randomUUID().slice(0, 8).toUpperCase()}`,
      name: "Rating Integration Food",
      category: "Camilan",
      taste: "Gurih",
      origin: "Indonesia"
    } });
    foodId = food.id;
    const initialRevision = (await prisma.ratingDatasetState.findUniqueOrThrow({ where: { id: 1 } })).currentRevision;
    const catalogBefore = await page(`/foods?search=${encodeURIComponent(food.foodCode)}`, userCookie);
    assert.equal(catalogBefore.status, 200);
    const catalogBeforeHtml = await catalogBefore.text();
    assert.match(catalogBeforeHtml, /0 dari \d+ makanan aktif dinilai/);
    assert.match(catalogBeforeHtml, /1 Tidak suka · 2 Kurang suka · 3 Biasa saja · 4 Suka · 5 Sangat suka/);
    const foodList = await api(`/api/foods?search=${encodeURIComponent(food.foodCode)}`);
    assert.equal(foodList.status, 200);
    const foodPayload = await foodList.json();
    assert.ok(foodPayload.data.foods.some((item: { id: number }) => item.id === food.id));
    assert.equal((await api(`/api/foods/${food.id}`)).status, 200);

    const deniedAdminRating = await api(`/api/foods/${food.id}/rating`, "PUT", { rating: 5 });
    assert.equal(deniedAdminRating.status, 401);
    assert.equal((await api(`/api/foods/${food.id}/rating`, "PUT", { rating: 6 }, userCookie)).status, 422);

    const firstRating = await api(`/api/foods/${food.id}/rating`, "PUT", { rating: 5 }, userCookie);
    assert.equal(firstRating.status, 200, await firstRating.clone().text());
    assert.equal((await prisma.ratingDatasetState.findUniqueOrThrow({ where: { id: 1 } })).currentRevision, initialRevision + BigInt(1));
    const firstUsedAt = (await prisma.food.findUniqueOrThrow({ where: { id: food.id } })).firstUsedAt;
    assert.ok(firstUsedAt);
    assert.equal(await prisma.rating.count({ where: { userId, foodId: food.id } }), 1);

    const updatedRating = await api(`/api/foods/${food.id}/rating`, "PUT", { rating: 3 }, userCookie);
    assert.equal(updatedRating.status, 200);
    assert.equal((await prisma.ratingDatasetState.findUniqueOrThrow({ where: { id: 1 } })).currentRevision, initialRevision + BigInt(2));
    assert.equal(await prisma.rating.count({ where: { userId, foodId: food.id } }), 1);
    assert.equal((await prisma.rating.findFirstOrThrow({ where: { userId, foodId: food.id } })).rating, 3);
    assert.equal((await prisma.food.findUniqueOrThrow({ where: { id: food.id } })).firstUsedAt?.getTime(), firstUsedAt.getTime());
    const unchangedRating = await api(`/api/foods/${food.id}/rating`, "PUT", { rating: 3 }, userCookie);
    assert.equal(unchangedRating.status, 200);
    assert.equal((await prisma.ratingDatasetState.findUniqueOrThrow({ where: { id: 1 } })).currentRevision, initialRevision + BigInt(2));
    const catalogAfter = await page(`/foods?search=${encodeURIComponent(food.foodCode)}`, userCookie);
    assert.match(await catalogAfter.text(), /1 dari \d+ makanan aktif dinilai/);
    const home = await page("/", userCookie);
    assert.match(await home.text(), /Cari yang belum dinilai/);

    const history = await api("/api/my-ratings", "GET", undefined, userCookie);
    assert.equal(history.status, 200);
    assert.equal((await history.json()).data.ratings[0].rating, 3);
    assert.equal((await page("/my-ratings", userCookie)).status, 200);
    const historyPage = await page("/my-ratings", userCookie);
    const historyHtml = await historyPage.text();
    assert.match(historyHtml, /Rating Integration User|Rating Saya|Nasi Goreng/);
    assert.match(historyHtml, /Rata-rata[\s\S]{0,100}3,0/);
    assert.match(historyHtml, /Kembali ke katalog/);

    const extraFoods = await prisma.food.findMany({ where: { isActive: true, id: { not: food.id } }, orderBy: { id: "asc" }, take: 20, select: { id: true } });
    assert.equal(extraFoods.length, 20, "pagination fixture needs 20 additional active foods");
    await prisma.rating.createMany({ data: extraFoods.map(({ id }) => ({ userId: user.id, foodId: id, rating: 4 })) });
    const firstRatingsPage = await (await page("/my-ratings", userCookie)).text();
    assert.match(firstRatingsPage, /href="\/my-ratings\?page=2"/);
    const outOfRangeRatingsPage = await (await page("/my-ratings?page=999999", userCookie)).text();
    assert.match(outOfRangeRatingsPage, /aria-label="Pagination rating"/);
    assert.match(outOfRangeRatingsPage, /aria-current="page"/);
    assert.match(outOfRangeRatingsPage, /Halaman/);
    assert.match(outOfRangeRatingsPage, /href="\/my-ratings\?page=1"/);
    assert.doesNotMatch(outOfRangeRatingsPage, /page=999998/);

    const adminLogin = await api("/api/auth/sign-in/email", "POST", { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD });
    assert.equal(adminLogin.status, 200);
    const adminCookie = cookiesFrom(adminLogin);
    assert.equal((await api(`/api/foods/${food.id}/rating`, "PUT", { rating: 2 }, adminCookie)).status, 403);
    assert.equal((await api("/api/my-ratings", "GET", undefined, adminCookie)).status, 403);
    assert.equal((await page("/admin/ratings", adminCookie)).status, 200);
    assert.equal((await api("/api/admin/rating-datasets", "GET", undefined, adminCookie)).status, 200);

    const snapshotRevision = (await prisma.ratingDatasetState.findUniqueOrThrow({ where: { id: 1 } })).currentRevision;
    const expectedSnapshotRowCount = await prisma.rating.count();
    const [exportResponse, concurrentUpdate] = await Promise.all([
      api("/api/admin/rating-datasets", "POST", undefined, adminCookie),
      api(`/api/foods/${food.id}/rating`, "PUT", { rating: 2 }, userCookie)
    ]);
    assert.equal(concurrentUpdate.status, 200);
    assert.equal(exportResponse.status, 201, await exportResponse.clone().text());
    const datasetExport = (await exportResponse.json()).data;
    assert.equal(datasetExport.rowCount, expectedSnapshotRowCount);
    assert.ok([snapshotRevision, snapshotRevision + BigInt(1)].map(String).includes(datasetExport.ratingRevision));
    assert.equal("filePath" in datasetExport, false);
    const filteredSnapshots = await page(`/admin/ratings?search=${encodeURIComponent(datasetExport.filename)}&page=999999`, adminCookie);
    assert.equal(filteredSnapshots.status, 200);
    const filteredSnapshotsHtml = await filteredSnapshots.text();
    assert.match(filteredSnapshotsHtml, new RegExp(`#(?:<!-- -->)?${datasetExport.id}`), "search by snapshot filename should keep matching snapshot visible");
    assert.ok(filteredSnapshotsHtml.includes(datasetExport.filename));
    const missingSnapshots = await page("/admin/ratings?search=no-such-snapshot.csv", adminCookie);
    assert.match(await missingSnapshots.text(), /Tidak ada snapshot yang cocok/);
    const download = await api(`/api/admin/rating-datasets/${datasetExport.id}/download`, "GET", undefined, adminCookie);
    assert.equal(download.status, 200);
    const csv = await download.text();
    assert.match(csv, /^user_id,food_id,rating\r\n/);
    const snapshotValue = new RegExp(`^${user.id},${food.id},(\\d+)\\r?$`, "m").exec(csv)?.[1];
    assert.ok(["2", "3"].includes(snapshotValue ?? ""));
    assert.equal(datasetExport.ratingRevision, String(snapshotValue === "2" ? snapshotRevision + BigInt(1) : snapshotRevision));
    assert.equal(csv.includes(email), false);

    const userDownload = await api(`/api/admin/rating-datasets/${datasetExport.id}/download`, "GET", undefined, userCookie);
    assert.equal(userDownload.status, 403);
    await assert.rejects(prisma.datasetExport.update({ where: { id: datasetExport.id }, data: { filename: "changed.csv" } }));
  } finally {
    if (userId !== undefined) {
      await prisma.rating.deleteMany({ where: { userId } });
    }
    if (userId !== undefined && foodId !== undefined) {
      await prisma.food.updateMany({ where: { id: foodId }, data: { firstUsedAt: null } });
    }
    if (userId !== undefined) await prisma.user.delete({ where: { id: userId } });
    if (foodId !== undefined) await prisma.food.deleteMany({ where: { id: foodId } });
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await app.close();
    await prisma.$disconnect();
  }
});
