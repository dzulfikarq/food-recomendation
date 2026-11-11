import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import pg from "pg";
import { expect, test, type Page } from "@playwright/test";

const baseURL = process.env.AUTH_URL ?? "http://127.0.0.1:3111";
const runId = process.env.FOODREC_E2E_RUN_ID ?? randomUUID();
const userEmail = `foodcom-user-${runId}@example.test`;
const userPassword = randomBytes(18).toString("base64url");
const adminEmail = process.env.ADMIN_EMAIL!;
const adminPassword = process.env.ADMIN_PASSWORD!;

async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, values: unknown[] = []) {
  const connectionString = process.env.FOODREC_E2E_DATABASE_URL;
  assert.ok(connectionString, "Food.com E2E database URL must be explicit.");
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    return await client.query<T>(sql, values);
  } finally {
    await client.end();
  }
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/" || url.pathname === "/admin");
}

async function waitForJob(jobId: string) {
  for (let attempt = 0; attempt < 90; attempt++) {
    const job = await query<{ status: string; errorSummary: string | null }>(
      'SELECT status, "errorSummary" FROM "RecommendationJob" WHERE id = $1', [jobId]
    );
    if (job.rows[0]?.status === "SUCCEEDED") {
      const artifact = await query<{ verificationStatus: string; payload: { recommendations: unknown[] } }>(
        'SELECT "verificationStatus", payload FROM "RecommendationJobArtifact" WHERE "jobId" = $1', [jobId]
      );
      return artifact.rows[0];
    }
    if (job.rows[0]?.status === "FAILED") throw new Error(`Worker job failed: ${job.rows[0].errorSummary}`);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error("Food.com recommendation worker did not finish within 90 seconds.");
}

test("Food.com catalog, app rating, namespaced snapshot, and manual worker staging", async ({ page, browser }) => {
  const catalog = await query<{
    id: number;
    name: string;
    tags: string[];
    sourceUserId: string;
  }>(`
    SELECT food.id, food.name, food.tags, ratings."sourceUserId"::text AS "sourceUserId"
    FROM "Food" AS food
    JOIN "FoodCatalogImport" AS imported ON imported.id = food."sourceImportId" AND imported."isActive"
    JOIN "HistoricalRating" AS ratings ON ratings."foodId" = food.id AND ratings."importId" = imported.id
    WHERE food."sourceDataset" = 'FOODCOM' AND food."isActive"
      AND jsonb_array_length(COALESCE(food.tags, '[]'::jsonb)) > 0
      AND jsonb_array_length(COALESCE(food.steps, '[]'::jsonb)) > 0
      AND jsonb_array_length(COALESCE(food.ingredients, '[]'::jsonb)) > 0
      AND EXISTS (SELECT 1 FROM "HistoricalRating" other WHERE other."importId" = imported.id AND other."sourceUserId" = ratings."sourceUserId" AND other."foodId" <> food.id)
    ORDER BY (SELECT COUNT(*) FROM "HistoricalRating" popular WHERE popular."importId" = imported.id AND popular."foodId" = food.id) DESC, food.id
    LIMIT 1
  `);
  const targetFood = catalog.rows[0];
  assert.ok(targetFood, "Subset needs a recipe with a tag and co-rated historical items.");
  const detailApi = await page.request.get(`${baseURL}/api/foods/${targetFood.id}`);
  expect(detailApi.status()).toBe(200);
  const apiBody = await detailApi.json() as { data: { sourceDataset: string; sourceId: string; imageUrl: string | null; tags: string[]; steps: string[] } };
  expect(apiBody.data).toMatchObject({ sourceDataset: "FOODCOM", imageUrl: null });
  expect(apiBody.data.sourceId).toMatch(/^\d+$/);
  expect(apiBody.data.tags.length).toBeGreaterThan(0);
  expect(apiBody.data.steps.length).toBeGreaterThan(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/foods");
  await expect(page.getByRole("heading", { name: "Katalog Makanan" })).toBeVisible();
  await page.getByLabel("Cari makanan").fill(targetFood.name);
  await page.getByLabel("Tag resep").fill(targetFood.tags[0]!);
  await page.getByRole("button", { name: "Cari", exact: true }).click();
  await expect(page.getByRole("heading", { name: targetFood.name, exact: true })).toBeVisible();
  const dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  await page.getByRole("link", { name: /Lihat detail/ }).first().click();
  await expect(page.getByText("Foto belum tersedia")).toBeVisible();
  await expect(page.getByText(`Sumber Food.com · Resep #${(await query<{ sourceId: string }>('SELECT "sourceId" FROM "Food" WHERE id = $1', [targetFood.id])).rows[0]?.sourceId}`)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bahan", exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Langkah", exact: false })).toBeVisible();

  await page.goto("/register");
  await page.getByLabel("Nama lengkap").fill("Food.com E2E User");
  await page.getByLabel("Email", { exact: true }).fill(userEmail);
  await page.getByLabel("Password", { exact: true }).fill(userPassword);
  await page.getByLabel("Konfirmasi password").fill(userPassword);
  await page.getByRole("button", { name: "Buat akun", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  const userId = Number((await query<{ id: number }>('SELECT id FROM "User" WHERE email = $1', [userEmail])).rows[0]?.id);
  assert.ok(Number.isSafeInteger(userId) && userId > 0);

  await page.goto(`/foods/${targetFood.id}`);
  await page.getByRole("radio", { name: "5 dari 5, sangat suka" }).check({ force: true });
  await page.getByRole("button", { name: "Simpan rating" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Rating berhasil disimpan." })).toBeVisible();
  const savedRating = await query<{ rating: number }>('SELECT rating FROM "Rating" WHERE "userId" = $1 AND "foodId" = $2', [userId, targetFood.id]);
  expect(savedRating.rows[0]?.rating).toBe(5);
  await page.goto("/my-ratings");
  await expect(page.getByRole("heading", { name: targetFood.name, exact: true })).toBeVisible();

  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  try {
    await login(admin, adminEmail, adminPassword);
    const snapshotResponse = await admin.request.post(`${baseURL}/api/admin/rating-datasets`, { headers: { origin: baseURL } });
    expect(snapshotResponse.status()).toBe(201);
    const snapshotBody = await snapshotResponse.json() as { data: { id: number; rowCount: number } };
    const download = await admin.request.get(`${baseURL}/api/admin/rating-datasets/${snapshotBody.data.id}/download`);
    expect(download.status()).toBe(200);
    const snapshot = await download.text();
    expect(snapshot).toContain("user_id,food_id,rating");
    expect(snapshot).toContain(`${userId},${targetFood.id},5`);
    expect(snapshot.split(/\r?\n/).some((line) => /^-[1-9]\d*,\d+,[1-5]$/.test(line))).toBe(true);
    expect(snapshot).not.toContain(userEmail);
    expect(snapshot).not.toContain("Food.com E2E User");

    const createJobResponse = await admin.request.post(`${baseURL}/api/admin/recommendation-jobs`, {
      headers: { origin: baseURL },
      data: { datasetExportId: snapshotBody.data.id, kNeighbors: 100, topN: 20, idempotencyKey: randomUUID() },
    });
    expect(createJobResponse.status()).toBe(201);
    const createJobBody = await createJobResponse.json() as { data: { id: string } };
    let worker: ChildProcess | undefined;
    try {
      worker = spawn(process.env.FOODREC_PYTHON || "python", ["services/recommender/src/worker.py"], {
        env: { ...process.env, FOODREC_WORKER_ID: `foodcom-${runId}` },
        stdio: "ignore",
        windowsHide: true,
      });
      const artifact = await waitForJob(createJobBody.data.id);
      expect(artifact?.verificationStatus).toBe("UNVERIFIED");
      const recommendations = artifact?.payload.recommendations as Array<{ userId: number; foodId: number; predictedRating: number }>;
      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations.every((row) => row.userId === userId && row.foodId !== targetFood.id && row.predictedRating >= 1 && row.predictedRating <= 5)).toBe(true);
      const existingFoods = await query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM "Food" WHERE "isActive" AND id = ANY($1::int[])',
        [recommendations.map(({ foodId }) => foodId)]
      );
      expect(Number(existingFoods.rows[0]?.count)).toBe(recommendations.length);
      const batchCount = await query<{ count: string }>('SELECT COUNT(*)::text AS count FROM "RecommendationBatch"');
      expect(Number(batchCount.rows[0]?.count)).toBe(0);
    } finally {
      if (worker && worker.exitCode === null) worker.kill();
    }
  } finally {
    await adminContext.close();
  }
});
