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
      const artifact = await query<{
        verificationStatus: string;
        sourceRatingRevision: string;
        currentRatingRevision: string;
        isStale: boolean;
        payload: { recommendations: unknown[] };
      }>(
        'SELECT "verificationStatus", "sourceRatingRevision"::text, "currentRatingRevision"::text, "isStale", payload FROM "RecommendationJobArtifact" WHERE "jobId" = $1', [jobId]
      );
      return artifact.rows[0];
    }
    if (job.rows[0]?.status === "FAILED") throw new Error(`Worker job failed: ${job.rows[0].errorSummary}`);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error("Food.com recommendation worker did not finish within 90 seconds.");
}

test("USER rating -> snapshot -> unverified worker; only manually validated published batch reaches USER", async ({ page, browser }) => {
  const imported = await query<{
    samplingStrategy: string;
    userCount: number;
    recipeCount: number;
    ratingCount: number;
  }>(`
    SELECT "samplingStrategy", "userCount", "recipeCount", "ratingCount"
    FROM "FoodCatalogImport" WHERE "sourceDataset" = 'FOODCOM' AND "isActive"
  `);
  expect(imported.rows).toHaveLength(1);
  expect(imported.rows[0]).toMatchObject({ samplingStrategy: "k_core", userCount: 500, recipeCount: 6_788, ratingCount: 19_299 });

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
  const candidate = await query<{ id: number; name: string; sourceId: string }>(`
    SELECT id, name, "sourceId" FROM "Food"
    WHERE "sourceDataset" = 'FOODCOM' AND "isActive" AND id <> $1
    ORDER BY id
    LIMIT 1
  `, [targetFood.id]);
  const recommendationFood = candidate.rows[0];
  assert.ok(recommendationFood, "Subset needs another active recipe for the manual validation fixture.");
  const detailApi = await page.request.get(`${baseURL}/api/foods/${targetFood.id}`);
  expect(detailApi.status()).toBe(200);
  const apiBody = await detailApi.json() as { data: { sourceDataset: string; sourceId: string; imageUrl: string | null; tags: string[]; steps: string[] } };
  expect(apiBody.data).toMatchObject({ sourceDataset: "FOODCOM", imageUrl: null });
  expect(apiBody.data.sourceId).toMatch(/^\d+$/);
  expect(apiBody.data.tags.length).toBeGreaterThan(0);
  expect(apiBody.data.steps.length).toBeGreaterThan(0);

  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(`/foods?search=foodrec-no-match-${runId}`);
  await expect(page.getByRole("heading", { name: "Tidak menemukan makanan" })).toBeVisible();
  let dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/foods");
  await expect(page.getByRole("heading", { name: "Katalog Makanan" })).toBeVisible();
  await page.getByLabel("Cari makanan").fill(targetFood.name);
  await page.getByLabel("Tag resep").fill(targetFood.tags[0]!);
  await page.getByRole("button", { name: "Cari", exact: true }).click();
  await expect(page.getByRole("heading", { name: targetFood.name, exact: true })).toBeVisible();
  dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  await page.getByRole("link", { name: /Lihat detail/ }).first().click();
  await expect(page.getByText("Foto belum tersedia")).toBeVisible();
  await expect(page.getByText(`Sumber Food.com · Resep #${(await query<{ sourceId: string }>('SELECT "sourceId" FROM "Food" WHERE id = $1', [targetFood.id])).rows[0]?.sourceId}`)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bahan", exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Langkah", exact: false })).toBeVisible();
  dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  await page.setViewportSize({ width: 1440, height: 960 });
  dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);

  await page.goto("/register");
  await page.getByLabel("Nama lengkap").fill("Food.com E2E User");
  await page.getByLabel("Email", { exact: true }).fill(userEmail);
  await page.getByLabel("Password", { exact: true }).fill(userPassword);
  await page.getByLabel("Konfirmasi password").fill(userPassword);
  await page.getByRole("button", { name: "Buat akun", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  const userId = Number((await query<{ id: number }>('SELECT id FROM "User" WHERE email = $1', [userEmail])).rows[0]?.id);
  assert.ok(Number.isSafeInteger(userId) && userId > 0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/my-ratings");
  await expect(page.getByRole("heading", { name: "Belum ada rating" })).toBeVisible();
  await page.goto("/recommendations");
  await expect(page.getByRole("heading", { name: "Mulai dari makanan yang kamu kenal" })).toBeVisible();

  await page.goto(`/foods/${targetFood.id}`);
  await page.getByRole("radio", { name: "5 dari 5, sangat suka" }).check({ force: true });
  const ratingEndpoint = `**/api/foods/${targetFood.id}/rating`;
  let failFirstRating = true;
  const ratingHandler = async (route: import("@playwright/test").Route) => {
    if (failFirstRating) {
      failFirstRating = false;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "Rating tidak dapat disimpan." } }),
      });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.continue();
  };
  await page.route(ratingEndpoint, ratingHandler);
  await page.getByRole("button", { name: "Simpan rating" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Rating tidak dapat disimpan." })).toBeVisible();
  expect((await query<{ count: string }>('SELECT COUNT(*)::text AS count FROM "Rating" WHERE "userId" = $1 AND "foodId" = $2', [userId, targetFood.id])).rows[0]?.count).toBe("0");
  await page.getByRole("button", { name: "Simpan rating" }).click();
  await expect(page.getByRole("button", { name: "Menyimpan" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Rating berhasil disimpan." })).toBeVisible();
  await page.unroute(ratingEndpoint, ratingHandler);
  const savedRating = await query<{ rating: number }>('SELECT rating FROM "Rating" WHERE "userId" = $1 AND "foodId" = $2', [userId, targetFood.id]);
  expect(savedRating.rows[0]?.rating).toBe(5);
  await page.goto("/my-ratings");
  await expect(page.getByRole("heading", { name: "Rating Saya" })).toBeVisible();
  await expect(page.getByRole("heading", { name: targetFood.name, exact: true })).toBeVisible();
  dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  await page.setViewportSize({ width: 1440, height: 960 });
  dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  await page.getByRole("button", { name: "Keluar" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await login(page, userEmail, userPassword);

  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  try {
    await login(admin, adminEmail, adminPassword);
    const snapshotResponse = await admin.request.post(`${baseURL}/api/admin/rating-datasets`, { headers: { origin: baseURL } });
    expect(snapshotResponse.status()).toBe(201);
    const snapshotBody = await snapshotResponse.json() as { data: { id: number; rowCount: number; ratingRevision: string } };
    const download = await admin.request.get(`${baseURL}/api/admin/rating-datasets/${snapshotBody.data.id}/download`);
    expect(download.status()).toBe(200);
    const snapshot = await download.text();
    expect(snapshot).toContain("user_id,food_id,rating");
    expect(snapshot).toContain(`${userId},${targetFood.id},5`);
    expect(snapshot.split(/\r?\n/).some((line) => /^-[1-9]\d*,\d+,[1-5]$/.test(line))).toBe(true);
    expect(snapshot).not.toContain(userEmail);
    expect(snapshot).not.toContain("Food.com E2E User");
    const revisions = await query<{ currentRevision: string; exportRevision: string }>(`
      SELECT state."currentRevision"::text AS "currentRevision", export."ratingRevision"::text AS "exportRevision"
      FROM "RatingDatasetState" state CROSS JOIN "DatasetExport" export WHERE export.id = $1 AND state.id = 1
    `, [snapshotBody.data.id]);
    expect(snapshotBody.data.ratingRevision).toBe(revisions.rows[0]?.currentRevision);
    expect(snapshotBody.data.ratingRevision).toBe(revisions.rows[0]?.exportRevision);

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
      expect(artifact?.sourceRatingRevision).toBe(snapshotBody.data.ratingRevision);
      expect(artifact?.currentRatingRevision).toBe(snapshotBody.data.ratingRevision);
      expect(artifact?.isStale).toBe(false);
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
      const engineConfig = await query<{
        autoProcessingEnabled: boolean;
        automaticPublicationEnabled: boolean;
        validationStatus: string;
      }>('SELECT "autoProcessingEnabled", "automaticPublicationEnabled", "validationStatus" FROM "RecommendationEngineConfig" WHERE id = 1');
      expect(engineConfig.rows[0]).toEqual({
        autoProcessingEnabled: false,
        automaticPublicationEnabled: false,
        validationStatus: "PENDING_VALIDATION",
      });
    } finally {
      if (worker && worker.exitCode === null) worker.kill();
    }

    const recommendationsPath = "**/api/me/recommendations";
    const slowRecommendations = async (route: import("@playwright/test").Route) => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      await route.continue();
    };
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route(recommendationsPath, slowRecommendations);
    await page.goto("/recommendations");
    await expect(page.getByRole("status").filter({ hasText: "Memuat rekomendasi" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Belum ada rekomendasi yang diterbitkan" })).toBeVisible();
    await page.unroute(recommendationsPath, slowRecommendations);
    dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);

    let failFirstRecommendations = true;
    const errorRecommendations = async (route: import("@playwright/test").Route) => {
      if (failFirstRecommendations) {
        failFirstRecommendations = false;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: { message: "Simulated recommendation outage." } }),
        });
        return;
      }
      await route.continue();
    };
    await page.route(recommendationsPath, errorRecommendations);
    await page.goto("/recommendations");
    await expect(page.getByRole("alert").filter({ hasText: "Simulated recommendation outage." })).toBeVisible();
    await page.getByRole("button", { name: "Coba lagi" }).click();
    await expect(page.getByRole("heading", { name: "Belum ada rekomendasi yang diterbitkan" })).toBeVisible();
    await page.unroute(recommendationsPath, errorRecommendations);
    await page.setViewportSize({ width: 1440, height: 960 });
    dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);

    await admin.goto("/admin/recommendations");
    await expect(admin.getByRole("heading", { name: "Pemrosesan Rekomendasi" })).toBeVisible();
    await admin.getByLabel("Dataset ekspor sumber").selectOption(String(snapshotBody.data.id));
    await admin.getByLabel("User k-NN (k)").fill("3");
    await admin.getByLabel("Top-N per pengguna").fill("1");
    await admin.getByLabel("File hasil Altair").setInputFiles({
      name: "verified-manual-fixture.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(`user_id,item_id,rank\n${userId},${recommendationFood.id},1\n`),
    });
    await admin.getByRole("button", { name: "Impor dan validasi CSV" }).click();
    await expect(admin.getByRole("status").filter({ hasText: "tervalidasi, tetapi belum diterbitkan" })).toBeVisible();
    const stagedBatch = await query<{ id: number; status: string; report: { summary: Record<string, number | boolean> } }>(`
      SELECT id, status, "validationReport" AS report FROM "RecommendationBatch"
      WHERE "datasetExportId" = $1 ORDER BY "createdAt" DESC LIMIT 1
    `, [snapshotBody.data.id]);
    expect(stagedBatch.rows[0]?.status).toBe("VALIDATED");
    expect(stagedBatch.rows[0]?.report.summary).toMatchObject({
      staleDataset: false,
      sourceUserCount: 1,
      userCount: 1,
      usersWithoutRecommendations: 0,
      ratedAfterExportCount: 0,
    });
    await admin.getByRole("button", { name: "Terbitkan Rekomendasi" }).click();
    const confirmDialog = admin.getByRole("alertdialog");
    await expect(confirmDialog.getByRole("heading", { name: "Terbitkan batch rekomendasi?" })).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Konfirmasi Terbitkan" }).click();
    await expect(admin.getByText("Batch berhasil dipublikasikan.", { exact: false })).toBeVisible();
    const publishedBatch = await query<{ count: string }>('SELECT COUNT(*)::text AS count FROM "RecommendationBatch" WHERE status = \'PUBLISHED\'');
    expect(publishedBatch.rows[0]?.count).toBe("1");

    const stillUnverified = await query<{ verificationStatus: string }>(`
      SELECT artifact."verificationStatus" FROM "RecommendationJobArtifact" artifact
      JOIN "RecommendationJob" job ON job.id = artifact."jobId" WHERE job.id = $1
    `, [createJobBody.data.id]);
    expect(stillUnverified.rows[0]?.verificationStatus).toBe("UNVERIFIED");
    const unchangedGate = await query<{
      autoProcessingEnabled: boolean;
      automaticPublicationEnabled: boolean;
      validationStatus: string;
    }>('SELECT "autoProcessingEnabled", "automaticPublicationEnabled", "validationStatus" FROM "RecommendationEngineConfig" WHERE id = 1');
    expect(unchangedGate.rows[0]).toEqual({ autoProcessingEnabled: false, automaticPublicationEnabled: false, validationStatus: "PENDING_VALIDATION" });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/recommendations");
    await expect(page.getByRole("heading", { name: "Rekomendasi Untukmu" })).toBeVisible();
    await expect(page.getByRole("heading", { name: recommendationFood.name, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: targetFood.name, exact: true })).toHaveCount(0);
    const recommendationLink = page.getByRole("link", { name: new RegExp(recommendationFood.name) });
    expect(await recommendationLink.getAttribute("href")).toBe(`/foods/${recommendationFood.id}`);
    dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
    await recommendationLink.click();
    await expect(page).toHaveURL((url) => url.pathname === `/foods/${recommendationFood.id}`);
    await expect(page.getByRole("heading", { name: recommendationFood.name, exact: true })).toBeVisible();
    await expect(page.getByText(`Sumber Food.com · Resep #${recommendationFood.sourceId}`)).toBeVisible();

    const candidateRatingEndpoint = `**/api/foods/${recommendationFood.id}/rating`;
    let failFirstCandidateRating = true;
    const candidateRatingHandler = async (route: import("@playwright/test").Route) => {
      if (failFirstCandidateRating) {
        failFirstCandidateRating = false;
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "Rating tidak dapat disimpan." } }) });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
      await route.continue();
    };
    await page.route(candidateRatingEndpoint, candidateRatingHandler);
    await page.getByRole("radio", { name: "4 dari 5, suka" }).check({ force: true });
    await page.getByRole("button", { name: "Simpan rating" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Rating tidak dapat disimpan." })).toBeVisible();
    await page.getByRole("button", { name: "Simpan rating" }).click();
    await expect(page.getByRole("button", { name: "Menyimpan" })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Rating berhasil disimpan." })).toBeVisible();
    await page.unroute(candidateRatingEndpoint, candidateRatingHandler);
    expect((await query<{ rating: number }>('SELECT rating FROM "Rating" WHERE "userId" = $1 AND "foodId" = $2', [userId, recommendationFood.id])).rows[0]?.rating).toBe(4);

    await page.goto("/my-ratings");
    await expect(page.getByRole("heading", { name: "Rating Saya" })).toBeVisible();
    await expect(page.getByRole("heading", { name: targetFood.name, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: recommendationFood.name, exact: true })).toBeVisible();
    dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
    await page.setViewportSize({ width: 1440, height: 960 });
    dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/recommendations");
    await expect(page.getByRole("heading", { name: "Semua rekomendasi sudah kamu nilai" })).toBeVisible();
    await expect(page.getByRole("heading", { name: recommendationFood.name, exact: true })).toHaveCount(0);
    dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  } finally {
    await adminContext.close();
  }
});
