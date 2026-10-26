import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import test from "node:test";
import "@/tests/helpers/test-database";

test("recommendation import validation, private user results, and concurrent atomic publication", async () => {
  Reflect.set(process.env, "NODE_ENV", "production");
  Reflect.set(process.env, "AUTH_URL", "http://127.0.0.1:3104");
  const [{ default: next }, { hashPassword }, { readApplicationEnvironment }, { prisma }] = await Promise.all([
    import("next"),
    import("better-auth/crypto"),
    import("@/lib/env"),
    import("@/lib/prisma")
  ]);
  const env = readApplicationEnvironment();
  const baseUrl = env.AUTH_URL;
  const password = "recommendation-integration-password";
  const app = next({ dev: false, hostname: "127.0.0.1", port: 3104 });
  await app.prepare();
  const server = createServer(app.getRequestHandler());
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(3104, "127.0.0.1", resolve);
  });

  const api = (path: string, method = "GET", body?: unknown, cookie?: string) => fetch(`${baseUrl}${path}`, {
    method,
    headers: { origin: baseUrl, ...(body === undefined || body instanceof FormData ? {} : { "content-type": "application/json" }), ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }),
    redirect: "manual"
  });
  const page = (path: string, cookie?: string) => fetch(`${baseUrl}${path}`, { headers: cookie ? { cookie } : undefined, redirect: "manual" });
  const cookiesFrom = (response: Response) => response.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");

  async function createLogin(name: string, role: "USER" | "ADMIN") {
    const email = `recommendation-${randomUUID()}@example.test`;
    const user = await prisma.user.create({ data: { name, email, role, emailVerified: true } });
    await prisma.account.create({ data: { accountId: String(user.id), providerId: "credential", userId: user.id, password: await hashPassword(password) } });
    const login = await api("/api/auth/sign-in/email", "POST", { email, password });
    assert.equal(login.status, 200, await login.clone().text());
    return { id: user.id, cookie: cookiesFrom(login) };
  }

  async function createFood(name: string, isActive = true) {
    const food = await prisma.food.create({ data: { foodCode: `TEST-REC-${randomUUID().slice(0, 8).toUpperCase()}`, name, category: "Camilan", taste: "Gurih", origin: "Indonesia", isActive } });
    return food.id;
  }

  async function upload(datasetExportId: number, csv: string, cookie: string, kNeighbors = 3, topN = 2) {
    const form = new FormData();
    form.set("datasetExportId", String(datasetExportId));
    form.set("kNeighbors", String(kNeighbors));
    form.set("topN", String(topN));
    form.set("file", new File([csv], "recommendations.csv", { type: "text/csv" }));
    return api("/api/admin/recommendation-batches/import", "POST", form, cookie);
  }

  try {
    assert.equal((await api("/api/admin/recommendation-batches")).status, 401);
    assert.equal((await api("/api/me/recommendations")).status, 401);

    const adminLogin = await api("/api/auth/sign-in/email", "POST", { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD });
    assert.equal(adminLogin.status, 200);
    const adminCookie = cookiesFrom(adminLogin);
    const otherAdmin = await createLogin("Second recommendation admin", "ADMIN");
    const userA = await createLogin("Recommendation User A", "USER");
    const userB = await createLogin("Recommendation User B", "USER");
    const userC = await createLogin("Recommendation User C", "USER");
    assert.equal((await page("/recommendations")).status, 307);
    assert.equal((await page("/admin/recommendations", adminCookie)).status, 200);
    assert.equal((await api("/api/admin/recommendation-batches", "GET", undefined, userA.cookie)).status, 403);
    assert.equal((await api("/api/admin/recommendation-batches/import", "POST", new FormData(), userA.cookie)).status, 403);
    assert.equal((await api("/api/me/recommendations", "GET", undefined, adminCookie)).status, 403);
    const noRatings = await api("/api/me/recommendations", "GET", undefined, userA.cookie);
    assert.equal(noRatings.status, 200);
    assert.equal((await noRatings.json()).data.status, "NO_RATINGS");

    const sourceFoodA = await createFood("Snapshot Food A");
    const sourceFoodB = await createFood("Snapshot Food B");
    const newlyRatedFood = await createFood("Rated After Export");
    const userAFood = await createFood("Recommendation Food A");
    const userBFood = await createFood("Recommendation Food B");
    const inactiveFood = await createFood("Inactive Recommendation Food", false);
    await prisma.rating.createMany({ data: [
      { userId: userA.id, foodId: sourceFoodA, rating: 4 },
      { userId: userB.id, foodId: sourceFoodA, rating: 3 },
      { userId: userC.id, foodId: sourceFoodB, rating: 5 }
    ] });

    const exportResponse = await api("/api/admin/rating-datasets", "POST", undefined, adminCookie);
    assert.equal(exportResponse.status, 201, await exportResponse.clone().text());
    const datasetExportId = (await exportResponse.json()).data.id as number;
    await prisma.rating.create({ data: { userId: userA.id, foodId: newlyRatedFood, rating: 5 } });

    const ratedInSnapshot = await upload(datasetExportId, `user_id,item_id,rank\n${userA.id},${sourceFoodA},1\n`, adminCookie, 3, 1);
    assert.equal(ratedInSnapshot.status, 422);
    assert.match((await ratedInSnapshot.json()).error.details[0].message, /dataset sumber/);

    const inactive = await upload(datasetExportId, `user_id,item_id,rank\n${userA.id},${inactiveFood},1\n`, adminCookie, 3, 1);
    assert.equal(inactive.status, 422);
    assert.match((await inactive.json()).error.details[0].message, /nonaktif/);

    const missingReferences = await upload(datasetExportId, `user_id,item_id,rank\n999999999,999999998,1\n`, adminCookie, 3, 1);
    assert.equal(missingReferences.status, 422);
    const badHeader = await upload(datasetExportId, `user_id,food_id,rank\n${userA.id},${userAFood},1\n`, adminCookie, 3, 1);
    assert.equal(badHeader.status, 422);

    const validCsv = `user_id,item_id,rank\n${userA.id},${newlyRatedFood},1\n${userA.id},${userAFood},2\n${userB.id},${userBFood},1\n`;
    const imported = await upload(datasetExportId, validCsv, adminCookie);
    assert.equal(imported.status, 201, await imported.clone().text());
    const importedData = (await imported.json()).data;
    const batchId = importedData.batchId as number;
    assert.equal(importedData.status, "VALIDATED");
    assert.equal(importedData.report.summary.recommendationCount, 3);
    assert.equal(importedData.report.summary.userCount, 2);
    assert.ok(importedData.report.summary.usersWithoutRecommendations >= 1);
    assert.equal(importedData.report.summary.staleDataset, true);
    assert.equal(importedData.report.summary.ratedAfterExportCount, 1);
    assert.equal(await prisma.recommendationBatch.count({ where: { id: batchId, status: "PUBLISHED" } }), 0);
    assert.equal((await api(`/api/admin/recommendation-batches/${batchId}/publish`, "POST", {}, userA.cookie)).status, 403);

    const list = await api("/api/admin/recommendation-batches?page=1&pageSize=10", "GET", undefined, adminCookie);
    assert.equal(list.status, 200);
    assert.ok((await list.json()).data.items.some((item: { id: number }) => item.id === batchId));
    const detail = await api(`/api/admin/recommendation-batches/${batchId}`, "GET", undefined, adminCookie);
    assert.equal(detail.status, 200);
    assert.equal((await detail.json()).data.recommendations.length, 3);

    await prisma.food.update({ where: { id: userAFood }, data: { isActive: false } });
    const blockedPublish = await api(`/api/admin/recommendation-batches/${batchId}/publish`, "POST", {}, adminCookie);
    assert.equal(blockedPublish.status, 409);
    await prisma.food.update({ where: { id: userAFood }, data: { isActive: true } });
    const firstPublish = await api(`/api/admin/recommendation-batches/${batchId}/publish`, "POST", {}, adminCookie);
    assert.equal(firstPublish.status, 200, await firstPublish.clone().text());
    const publishedBatch = await prisma.recommendationBatch.findUniqueOrThrow({ where: { id: batchId } });
    assert.equal(publishedBatch.status, "PUBLISHED");
    assert.equal(publishedBatch.publishedById, Number((await prisma.user.findUniqueOrThrow({ where: { email: env.ADMIN_EMAIL } })).id));

    const activeBatchCsv = `user_id,item_id,rank\n${userA.id},${newlyRatedFood},1\n${userA.id},${userAFood},2\n${userB.id},${userBFood},1\n`;
    const concurrentCsv = `user_id,item_id,rank\n${userB.id},${userBFood},1\n${userA.id},${userAFood},2\n${userA.id},${newlyRatedFood},1\n`;
    const [nextAResponse, nextBResponse] = await Promise.all([
      upload(datasetExportId, activeBatchCsv, adminCookie),
      upload(datasetExportId, concurrentCsv, otherAdmin.cookie)
    ]);
    assert.equal(nextAResponse.status, 201);
    assert.equal(nextBResponse.status, 201);
    const nextA = (await nextAResponse.json()).data.batchId as number;
    const nextB = (await nextBResponse.json()).data.batchId as number;
    const published = await Promise.all([
      api(`/api/admin/recommendation-batches/${nextA}/publish`, "POST", {}, adminCookie),
      api(`/api/admin/recommendation-batches/${nextB}/publish`, "POST", {}, otherAdmin.cookie)
    ]);
    assert.deepEqual(published.map(({ status }) => status), [200, 200]);
    assert.equal(await prisma.recommendationBatch.count({ where: { status: "PUBLISHED" } }), 1);
    assert.equal(await prisma.recommendationBatch.count({ where: { id: batchId, status: "SUPERSEDED" } }), 1);
    assert.equal(await prisma.recommendationBatch.count({ where: { id: { in: [nextA, nextB] }, status: "SUPERSEDED" } }), 1);

    const userAResponse = await api(`/api/me/recommendations?userId=${userB.id}`, "GET", undefined, userA.cookie);
    assert.equal(userAResponse.status, 200);
    const userAData = (await userAResponse.json()).data;
    assert.equal(userAData.status, "READY");
    assert.deepEqual(userAData.recommendations.map((row: { food: { id: number } }) => row.food.id), [userAFood]);
    assert.equal(userAData.recommendations[0].rank, 2);
    assert.equal((await page("/recommendations", userA.cookie)).status, 200);
    assert.equal((await page(`/foods/${userAFood}`, userA.cookie)).status, 200);

    const userBData = (await (await api("/api/me/recommendations", "GET", undefined, userB.cookie)).json()).data;
    assert.deepEqual(userBData.recommendations.map((row: { food: { id: number } }) => row.food.id), [userBFood]);
    const userCData = (await (await api("/api/me/recommendations", "GET", undefined, userC.cookie)).json()).data;
    assert.equal(userCData.status, "NOT_INCLUDED");
    await prisma.rating.create({ data: { userId: userA.id, foodId: userAFood, rating: 4 } });
    const allRated = (await (await api("/api/me/recommendations", "GET", undefined, userA.cookie)).json()).data;
    assert.equal(allRated.status, "ALL_RATED");
    await prisma.food.update({ where: { id: userBFood }, data: { isActive: false } });
    const inactiveAfterPublish = (await (await api("/api/me/recommendations", "GET", undefined, userB.cookie)).json()).data;
    assert.equal(inactiveAfterPublish.status, "NO_AVAILABLE_FOODS");
  } finally {
    // Research snapshots/batches are immutable; fixtures stay only in the isolated *_test database.
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await app.close();
    await prisma.$disconnect();
  }
});
