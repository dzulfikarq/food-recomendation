import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import test from "node:test";
import "@/tests/helpers/test-database";

test("Food Management CRUD, image uploads, hybrid delete, and atomic insert-only CSV import", async () => {
  Reflect.set(process.env, "NODE_ENV", "production");
  Reflect.set(process.env, "AUTH_URL", "http://127.0.0.1:3102");
  const [{ default: next }, { hashPassword }, { readApplicationEnvironment }, { prisma }, { removeFoodImage, removeCsvDraft }] = await Promise.all([
    import("next"),
    import("better-auth/crypto"),
    import("@/lib/env"),
    import("@/lib/prisma"),
    import("@/lib/food/storage")
  ]);
  const env = readApplicationEnvironment();
  const baseUrl = env.AUTH_URL;
  const email = `food-user-${randomUUID()}@example.test`;
  const password = "food-management-user-password";
  const foodIds: number[] = [];
  const importIds: number[] = [];
  const imageUrls: string[] = [];

  const app = next({ dev: false, hostname: "127.0.0.1", port: 3102 });
  await app.prepare();
  const server = createServer(app.getRequestHandler());
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(3102, "127.0.0.1", resolve);
  });

  const get = (path: string, cookie?: string) => fetch(`${baseUrl}${path}`, { headers: cookie ? { cookie } : undefined, redirect: "manual" });
  const json = (path: string, method: string, body: unknown, cookie?: string) => fetch(`${baseUrl}${path}`, {
    method,
    headers: { origin: baseUrl, "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
    redirect: "manual"
  });
  const multipart = (path: string, body: FormData, cookie: string) => fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { cookie, origin: baseUrl },
    body,
    redirect: "manual"
  });

  try {
    const seededCount = await prisma.food.count();
    assert.ok(seededCount >= 30, `Expected initial catalog, received ${seededCount} foods.`);

    assert.equal((await get("/api/admin/foods")).status, 401);
    const user = await prisma.user.create({ data: { name: "Food API User", email, emailVerified: true } });
    await prisma.account.create({ data: { accountId: String(user.id), providerId: "credential", userId: user.id, password: await hashPassword(password) } });
    const userLogin = await json("/api/auth/sign-in/email", "POST", { email, password });
    assert.equal(userLogin.status, 200);
    const userCookie = userLogin.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
    assert.equal((await get("/api/admin/foods", userCookie)).status, 403);

    const adminLogin = await json("/api/auth/sign-in/email", "POST", { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD });
    assert.equal(adminLogin.status, 200, await adminLogin.clone().text());
    const adminCookie = adminLogin.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
    const adminSessionResponse = await get("/api/auth/get-session", adminCookie);
    const adminSession = await adminSessionResponse.json();
    assert.equal(adminSession.user?.role, "ADMIN", JSON.stringify(adminSession));

    const listResponse = await get("/api/admin/foods?search=FOOD-001&status=active&sort=name-asc&page=1&pageSize=10", adminCookie);
    assert.equal(listResponse.status, 200, await listResponse.clone().text());
    const listData = await listResponse.json();
    assert.ok(listData.data.foods.some((food: { foodCode: string }) => food.foodCode === "FOOD-001"));
    assert.equal((await get("/admin/foods", adminCookie)).status, 200);
    assert.equal((await get("/admin/foods/new", adminCookie)).status, 200);
    assert.equal((await get("/admin/foods/import", adminCookie)).status, 200);

    const foodCode = `TEST-${randomUUID().slice(0, 8).toUpperCase()}`;
    const createFood = {
      foodCode,
      name: "Food API Integration",
      description: "A temporary test catalog record.",
      category: "Camilan",
      taste: "Gurih",
      origin: "Indonesia",
      proteinType: "Telur",
      priceCategory: "Sedang",
      mealTime: "Siang",
      texture: "Renyah",
      healthLevel: null,
      dietCategory: null
    };
    const protectedCreate = await json("/api/admin/foods", "POST", { ...createFood, isActive: false, firstUsedAt: new Date().toISOString() }, adminCookie);
    assert.equal(protectedCreate.status, 400);
    const created = await json("/api/admin/foods", "POST", createFood, adminCookie);
    assert.equal(created.status, 201, await created.clone().text());
    const foodId = (await created.json()).data.id as number;
    foodIds.push(foodId);
    assert.equal((await prisma.food.findUniqueOrThrow({ where: { id: foodId } })).isActive, true);
    assert.equal((await get(`/admin/foods/${foodId}/edit`, adminCookie)).status, 200);
    assert.equal((await json("/api/admin/foods", "POST", { ...createFood, name: "Duplicate" }, adminCookie)).status, 409);

    const imageBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nmV8AAAAASUVORK5CYII=", "base64");
    const invalidImage = new FormData();
    invalidImage.set("foodId", String(foodId));
    invalidImage.set("image", new File(["not image"], "bad.png", { type: "image/png" }));
    assert.equal((await multipart("/api/admin/foods/images", invalidImage, adminCookie)).status, 422);

    const imageForm = new FormData();
    imageForm.set("foodId", String(foodId));
    imageForm.set("image", new File([imageBytes], "dish.png", { type: "image/png" }));
    const imageUpload = await multipart("/api/admin/foods/images", imageForm, adminCookie);
    assert.equal(imageUpload.status, 200, await imageUpload.clone().text());
    const firstImageUrl = (await imageUpload.json()).data.imageUrl as string;
    imageUrls.push(firstImageUrl);
    const imageResponse = await get(firstImageUrl);
    assert.equal(imageResponse.status, 200);
    assert.equal(imageResponse.headers.get("content-type"), "image/png");

    const replacementForm = new FormData();
    replacementForm.set("foodId", String(foodId));
    replacementForm.set("image", new File([imageBytes], "replacement.png", { type: "image/png" }));
    const replacement = await multipart("/api/admin/foods/images", replacementForm, adminCookie);
    assert.equal(replacement.status, 200);
    const secondImageUrl = (await replacement.json()).data.imageUrl as string;
    imageUrls.push(secondImageUrl);
    assert.equal((await get(firstImageUrl)).status, 404);

    const edit = await json(`/api/admin/foods/${foodId}`, "PATCH", { name: "Food API Updated" }, adminCookie);
    assert.equal(edit.status, 200);
    assert.equal((await edit.json()).data.name, "Food API Updated");
    assert.equal((await json(`/api/admin/foods/${foodId}`, "PATCH", { foodCode: "CHANGED-001" }, adminCookie)).status, 409);
    assert.equal((await json(`/api/admin/foods/${foodId}/status`, "PATCH", { isActive: false }, adminCookie)).status, 200);
    assert.equal((await get(`/api/admin/foods?search=${foodCode}&status=inactive`, adminCookie)).status, 200);
    assert.equal((await json(`/api/admin/foods/${foodId}/status`, "PATCH", { isActive: true }, adminCookie)).status, 200);

    const admin = await prisma.user.findUniqueOrThrow({ where: { email: env.ADMIN_EMAIL } });
    await prisma.rating.create({ data: { userId: admin.id, foodId, rating: 4 } });
    await prisma.food.update({ where: { id: foodId }, data: { firstUsedAt: new Date() } });
    const blockedDelete = await json(`/api/admin/foods/${foodId}`, "DELETE", {}, adminCookie);
    assert.equal(blockedDelete.status, 409);
    assert.equal((await blockedDelete.json()).error.code, "FOOD_HAS_HISTORY");

    assert.equal((await json("/api/admin/foods/images", "DELETE", { foodId }, adminCookie)).status, 200);
    assert.equal((await get(secondImageUrl)).status, 404);
    await prisma.rating.deleteMany({ where: { foodId } });
    assert.equal((await json(`/api/admin/foods/${foodId}`, "DELETE", {}, adminCookie)).status, 409, "firstUsedAt keeps deleted rating history protected");
    await assert.rejects(prisma.food.delete({ where: { id: foodId } }));
    await prisma.food.update({ where: { id: foodId }, data: { firstUsedAt: null } });
    assert.equal((await json(`/api/admin/foods/${foodId}`, "DELETE", {}, adminCookie)).status, 200);
    foodIds.splice(foodIds.indexOf(foodId), 1);

    const template = await get("/api/admin/foods/imports/template", adminCookie);
    assert.equal(template.status, 200);
    const csvHeader = "food_code,name,description,category,taste,origin,protein_type,price_category,meal_time,texture,health_level,diet_category";
    assert.match(await template.text(), /food_code,name,description,category,taste,origin/);

    const importCode = `CSV-${randomUUID().slice(0, 8).toUpperCase()}`;
    const csvRow = `${importCode},CSV Integration Food,"Contains, a quoted comma",Makanan Berat,Gurih,Indonesia,Ayam,Sedang,Siang,Kering,,`;
    const csv = `${csvHeader}\r\n${csvRow}\r\n`;
    const previewForm = new FormData();
    previewForm.set("file", new File([csv], "catalog.csv", { type: "text/csv" }));
    const preview = await multipart("/api/admin/foods/imports/preview", previewForm, adminCookie);
    assert.equal(preview.status, 200, await preview.clone().text());
    const previewData = (await preview.json()).data;
    const importId = previewData.importId as number;
    importIds.push(importId);
    assert.equal(previewData.totalRows, 1);
    assert.equal(await prisma.food.findUnique({ where: { foodCode: importCode } }), null);

    const repeatForm = new FormData();
    repeatForm.set("file", new File([csv], "catalog.csv", { type: "text/csv" }));
    assert.equal((await (await multipart("/api/admin/foods/imports/preview", repeatForm, adminCookie)).json()).data.importId, importId);

    const commitUrl = `/api/admin/foods/imports/${importId}/commit`;
    const commits = await Promise.all([json(commitUrl, "POST", {}, adminCookie), json(commitUrl, "POST", {}, adminCookie)]);
    const statuses = commits.map((response) => response.status);
    assert.equal(statuses.filter((status) => status === 200).length, 1);
    assert.equal(statuses.filter((status) => status !== 200).length, 1);
    assert.equal(await prisma.food.count({ where: { foodCode: importCode } }), 1);
    const imported = await prisma.food.findUniqueOrThrow({ where: { foodCode: importCode } });
    foodIds.push(imported.id);
    assert.equal(imported.name, "CSV Integration Food");
    assert.equal(imported.description, "Contains, a quoted comma");
    assert.equal((await prisma.foodImport.findUniqueOrThrow({ where: { id: importId } })).insertedRows, 1);
    assert.equal((await json(commitUrl, "POST", {}, adminCookie)).status, 409);

    const overwriteRow = `${importCode},Overwritten,,Makanan Berat,Gurih,Indonesia,Ayam,Sedang,Siang,Kering,,`;
    const overwriteForm = new FormData();
    overwriteForm.set("file", new File([`${csvHeader}\n${overwriteRow}\n`], "overwrite.csv", { type: "text/csv" }));
    assert.equal((await multipart("/api/admin/foods/imports/preview", overwriteForm, adminCookie)).status, 422);
    assert.equal((await prisma.food.findUniqueOrThrow({ where: { foodCode: importCode } })).name, "CSV Integration Food");

    const partialCode = `CSV-${randomUUID().slice(0, 8).toUpperCase()}`;
    const validPartial = `${partialCode},Should Not Insert,,Camilan,Gurih,Indonesia,,,,,,`;
    const invalidPartial = "CSV-INVALID,,Missing Name,Makanan Berat,Gurih,Indonesia,,,,,,";
    const invalidForm = new FormData();
    invalidForm.set("file", new File([`${csvHeader}\n${validPartial}\n${invalidPartial}\n`], "invalid.csv", { type: "text/csv" }));
    assert.equal((await multipart("/api/admin/foods/imports/preview", invalidForm, adminCookie)).status, 422);
    assert.equal(await prisma.food.count({ where: { foodCode: partialCode } }), 0);

    const history = await get("/api/admin/foods/imports", adminCookie);
    assert.equal(history.status, 200);
    const historyItems = (await history.json()).data.imports;
    assert.ok(historyItems.some((item: { id: number; status: string }) => item.id === importId && item.status === "COMPLETED"));
    assert.equal("stagingKey" in historyItems[0], false);
  } finally {
    const staged = await prisma.foodImport.findMany({ where: { id: { in: importIds }, stagingKey: { not: null } } });
    for (const record of staged) {
      await removeCsvDraft(record.stagingKey!).catch(() => undefined);
      await prisma.foodImport.update({ where: { id: record.id }, data: { status: "FAILED", stagingKey: null } });
    }
    if (foodIds.length) {
      await prisma.rating.deleteMany({ where: { foodId: { in: foodIds } } });
      await prisma.food.updateMany({ where: { id: { in: foodIds } }, data: { firstUsedAt: null } });
      await prisma.food.deleteMany({ where: { id: { in: foodIds } } });
    }
    for (const imageUrl of imageUrls) await removeFoodImage(imageUrl).catch(() => undefined);
    await prisma.user.deleteMany({ where: { email } });
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await app.close();
    await prisma.$disconnect();
  }
});
