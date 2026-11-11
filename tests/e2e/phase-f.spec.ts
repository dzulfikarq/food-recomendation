import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import pg from "pg";

test.describe.configure({ mode: "serial" });

const baseURL = process.env.AUTH_URL ?? "http://127.0.0.1:3110";
const runId = process.env.FOODREC_E2E_RUN_ID ?? randomUUID();
const userAPassword = randomBytes(18).toString("base64url");
const userBPassword = randomBytes(18).toString("base64url");
const userCPassword = randomBytes(18).toString("base64url");
const userAEmail = `phase-f-user-a-${runId}@example.test`;
const userBEmail = `phase-f-user-b-${runId}@example.test`;
const userCEmail = `phase-f-user-c-${runId}@example.test`;
const adminEmail = process.env.ADMIN_EMAIL!;
const adminPassword = process.env.ADMIN_PASSWORD!;
const screenshotDir = path.resolve("test-results/phase-f/screenshots");

let food1Id = 0;
let food2Id = 0;
let userAId = 0;
let userBId = 0;
let researchStudyUnderTest: number | undefined;

async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, values: unknown[] = []) {
  const client = new pg.Client({ connectionString: process.env.FOODREC_TEST_DATABASE_URL ?? process.env.DATABASE_URL });
  await client.connect();
  try {
    return await client.query<T>(sql, values);
  } finally {
    await client.end();
  }
}

async function expectNoHorizontalOverflow(page: Page) {
  const width = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  expect(width.content, `document overflow: ${width.content}px > ${width.viewport}px`).toBeLessThanOrEqual(width.viewport + 1);
}

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations.map(({ id, impact, description, nodes }) => ({
    id,
    impact,
    description,
    elements: nodes.map(({ target, failureSummary }) => ({ target, failureSummary }))
  }))).toEqual([]);
}

async function expectLabeledFormControls(page: Page) {
  const unlabeled = await page.locator("form input:not([type=hidden]), form select, form textarea").evaluateAll((controls) =>
    controls.filter((control) => {
      const element = control as HTMLInputElement;
      return !element.labels?.length && !element.getAttribute("aria-label") && !element.getAttribute("aria-labelledby");
    }).map((control) => `${control.tagName.toLowerCase()}[name="${(control as HTMLInputElement).name}"]`)
  );
  expect(unlabeled).toEqual([]);
}

async function rateFood(page: Page, name: string, score: number) {
  const card = page.locator("section").filter({ has: page.getByRole("heading", { name, exact: true }) }).first();
  const group = card.getByRole("group");
  const labels = ["tidak suka", "kurang suka", "biasa saja", "suka", "sangat suka"];
  await group.getByRole("radio", { name: `${score} dari 5, ${labels[score - 1]}` }).check({ force: true });
  await group.getByRole("button").click();
  await expect(group.getByRole("status").filter({ hasText: "Rating berhasil disimpan." })).toBeVisible();
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await expectLabeledFormControls(page);
  await expectNoHorizontalOverflow(page);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/" || url.pathname === "/admin");
}

async function sameOriginJson(page: Page, url: string, method: "PATCH" | "POST", body: unknown) {
  return page.evaluate(async ({ url, method, body }) => {
    const response = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
  }, { url, method, body });
}

test.afterEach(async () => {
  if (researchStudyUnderTest === undefined) return;
  await query('UPDATE "ResearchStudy" SET status = $1 WHERE id = $2 AND status = $3', ["CLOSED", researchStudyUnderTest, "OPEN"]);
  researchStudyUnderTest = undefined;
});

test("Guest registration, protected access, responsive navigation, and USER rating journey", async ({ page }) => {
  await mkdir(screenshotDir, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Kenali seleramu/ })).toBeVisible();
  await page.goto("/foods");
  await expect(page.getByRole("heading", { name: "Katalog Makanan" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Lihat detail/ }).first()).toBeVisible();

  await page.goto("/my-ratings");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Masuk ke FoodRec" })).toBeVisible();
  await page.goto("/register");
  await expectLabeledFormControls(page);
  await expectAccessible(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const quickNav = page.getByRole("navigation", { name: "Navigasi cepat" });
  await expect(quickNav.getByRole("link", { name: "Masuk" })).toBeVisible();
  await expect(quickNav.getByRole("link", { name: "Rating saya" })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: path.join(screenshotDir, "guest-mobile-home.png"), fullPage: true });
  await page.keyboard.press("Tab");
  const focus = await page.evaluate(() => {
    const element = document.activeElement;
    return element instanceof HTMLElement ? { label: element.getAttribute("aria-label"), outline: getComputedStyle(element).outlineStyle } : null;
  });
  expect(focus?.label).toBe("FoodRec beranda");
  expect(focus?.outline).not.toBe("none");

  await page.goto("/register");
  await page.getByLabel("Nama lengkap").fill("QA Pengguna Satu");
  await page.getByLabel("Email", { exact: true }).fill(userAEmail);
  await page.getByLabel("Password", { exact: true }).fill(userAPassword);
  await page.getByLabel("Konfirmasi password").fill(userAPassword);
  await page.getByRole("button", { name: "Buat akun", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await expect(page.getByRole("heading", { name: "Hai, QA!" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Keluar" })).toBeVisible();

  await page.goto("/recommendations");
  await expect(page.getByRole("heading", { name: "Mulai dari makanan yang kamu kenal" })).toBeVisible();
  await expect(page.getByText(/admin memproses dan menerbitkan hasil/)).toBeVisible();

  const foodRows = await query<{ id: number; foodCode: string }>(
    'SELECT id, "foodCode" FROM "Food" WHERE "foodCode" IN ($1, $2)', ["FOOD-001", "FOOD-002"]
  );
  food1Id = Number(foodRows.rows.find((food) => food.foodCode === "FOOD-001")?.id);
  food2Id = Number(foodRows.rows.find((food) => food.foodCode === "FOOD-002")?.id);
  expect(food1Id).toBeGreaterThan(0);
  expect(food2Id).toBeGreaterThan(0);

  await page.goto("/foods");
  await page.getByLabel("Cari makanan").fill("Nasi Goreng");
  await page.getByLabel("Kategori").selectOption("Makanan Berat");
  await page.getByRole("button", { name: "Cari", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nasi Goreng" })).toBeVisible();
  await expectLabeledFormControls(page);
  await rateFood(page, "Nasi Goreng", 5);
  userAId = Number((await query<{ id: number }>('SELECT id FROM "User" WHERE email = $1', [userAEmail])).rows[0]?.id);
  expect(userAId).toBeGreaterThan(0);
  await page.screenshot({ path: path.join(screenshotDir, "user-catalog-mobile.png"), fullPage: true });
});

test("USER login, rating update, history, detail, filtering, and actionable empty recommendation state", async ({ page }) => {
  await login(page, userAEmail, userAPassword);
  await expect(page.getByRole("heading", { name: "Hai, QA!" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Cari yang belum dinilai" })).toHaveAttribute("href", "/foods?ratingStatus=unrated");
  await page.getByRole("link", { name: "Cari yang belum dinilai" }).click();
  await expect(page.getByLabel("Status rating")).toHaveValue("unrated");
  await page.getByLabel("Status rating").selectOption("rated");
  await page.getByLabel("Cari makanan").fill("Nasi Goreng");
  await page.getByRole("button", { name: "Cari", exact: true }).click();
  await expect(page).toHaveURL(/\/foods\?.*search=Nasi\+Goreng.*ratingStatus=rated/);
  await expect(page.getByRole("heading", { name: "Nasi Goreng" })).toBeVisible();
  await rateFood(page, "Nasi Goreng", 4);

  await page.goto("/my-ratings");
  await expect(page.getByRole("heading", { name: "Rating Saya" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nasi Goreng" })).toBeVisible();
  await page.goto(`/foods/${food1Id}`);
  await expect(page.getByRole("heading", { name: "Nasi Goreng" })).toBeVisible();
  await page.setViewportSize({ width: 820, height: 1024 });
  await expectNoHorizontalOverflow(page);
  await page.goto("/recommendations");
  await expect(page.getByRole("heading", { name: /Belum ada rekomendasi yang diterbitkan|Belum ada hasil untuk akunmu/ })).toBeVisible();
  await expect(page.getByText(/menyimpan rating tidak otomatis memulai pemrosesan|Akunmu tidak tercakup/)).toBeVisible();
  await page.screenshot({ path: path.join(screenshotDir, "user-recommendations-tablet.png"), fullPage: true });
  await page.getByRole("button", { name: "Keluar" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
});

test("second USER contributes real neighbor ratings through browser UI", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Nama lengkap").fill("QA Pengguna Dua");
  await page.getByLabel("Email", { exact: true }).fill(userBEmail);
  await page.getByLabel("Password", { exact: true }).fill(userBPassword);
  await page.getByLabel("Konfirmasi password").fill(userBPassword);
  await page.getByRole("button", { name: "Buat akun", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await page.goto("/foods");
  await page.getByLabel("Cari makanan").fill("Nasi Goreng");
  await page.getByRole("button", { name: "Cari", exact: true }).click();
  await rateFood(page, "Nasi Goreng", 4);
  await page.goto("/foods");
  await page.getByLabel("Cari makanan").fill("Mie Goreng");
  await page.getByRole("button", { name: "Cari", exact: true }).click();
  await rateFood(page, "Mie Goreng", 5);
  userBId = Number((await query<{ id: number }>('SELECT id FROM "User" WHERE email = $1', [userBEmail])).rows[0]?.id);
  expect(userBId).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Keluar" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
});

test("Admin Altair workflow, security gates, and real Python worker-to-PostgreSQL lifecycle", async ({ page }) => {
  await login(page, adminEmail, adminPassword);
  await expect(page.getByRole("heading", { name: /Selamat datang/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recommendation Engine" }).first()).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("navigation", { name: "Navigasi admin mobile" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: path.join(screenshotDir, "admin-dashboard-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.screenshot({ path: path.join(screenshotDir, "admin-dashboard-desktop.png"), fullPage: true });

  await page.goto("/admin/foods");
  await expect(page.getByRole("heading", { name: "Kelola Makanan" })).toBeVisible();
  await page.getByRole("link", { name: "Tambah Makanan" }).click();
  const foodCode = `QA-${runId.slice(0, 12).toUpperCase()}`;
  await page.getByLabel("Food Code").fill(foodCode);
  await page.getByLabel("Nama Makanan").fill(`Makanan Uji ${runId.slice(0, 6)}`);
  await page.getByLabel("Kategori").selectOption("Camilan");
  await page.getByLabel("Taste / Rasa").selectOption("Manis");
  await page.getByLabel("Origin / Asal").fill("Lingkungan pengujian");
  await expectLabeledFormControls(page);
  await page.getByRole("button", { name: "Simpan Makanan" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Makanan berhasil ditambahkan." })).toBeVisible();
  await expect(page.getByText(foodCode)).toBeVisible();

  await page.goto("/admin/ratings");
  await expect(page.getByRole("heading", { name: "Data Rating" })).toBeVisible();
  await expectLabeledFormControls(page);
  await page.getByRole("button", { name: /Buat Snapshot CSV/ }).click();
  await expect(page.getByRole("status").filter({ hasText: /Snapshot .* dibuat/ })).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: /Unduh/ }).first().click()
  ]);
  expect(download.suggestedFilename()).toMatch(/\.csv$/i);

  await page.goto("/admin/recommendations");
  await expect(page.getByRole("heading", { name: "Pemrosesan Rekomendasi" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Jalankan Altair" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recommendation Engine" })).toBeVisible();
  const monitor = page.locator('section[aria-labelledby="engine-monitoring-full"]');
  await expect(monitor.getByText("PENDING_VALIDATION")).toBeVisible();
  await expect(monitor.getByText("OFF", { exact: true })).toBeVisible();
  expect(await monitor.locator("input, select, textarea").count()).toBe(0);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: path.join(screenshotDir, "admin-altair-workflow-desktop.png"), fullPage: true });

  const datasetValue = await page.locator('select[name="datasetExportId"] option:not([disabled])').first().getAttribute("value");
  expect(datasetValue).toBeTruthy();
  const datasetExportId = Number(datasetValue);
  const userIds = await query<{ id: number; email: string }>('SELECT id, email FROM "User" WHERE email IN ($1, $2)', [userAEmail, userBEmail]);
  userAId = Number(userIds.rows.find((user) => user.email === userAEmail)?.id);
  userBId = Number(userIds.rows.find((user) => user.email === userBEmail)?.id);
  expect(userAId).toBeGreaterThan(0);
  expect(userBId).toBeGreaterThan(0);

  const datasetSelect = page.getByLabel("Dataset ekspor sumber");
  await datasetSelect.selectOption(String(datasetExportId));
  await page.locator('input[name="file"]').setInputFiles({
    name: "phase-f-invalid.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("user_id,item_id,rank\ninvalid,0,0\n")
  });
  await page.getByLabel("User k-NN (k)").fill("3");
  await page.getByLabel("Top-N per pengguna").fill("1");
  await page.getByRole("button", { name: "Impor dan validasi CSV" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /berstatus Draft/ })).toBeVisible();
  await expect(page.getByText(/Header|integer positif|validasi/i).first()).toBeVisible();

  await page.locator('input[name="file"]').setInputFiles({
    name: "phase-f-valid.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(`user_id,item_id,rank\n${userAId},${food2Id},1\n`)
  });
  await page.getByRole("button", { name: "Impor dan validasi CSV" }).click();
  await expect(page.getByRole("status").filter({ hasText: /tervalidasi, tetapi belum diterbitkan/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Terbitkan Rekomendasi" })).toBeVisible();
  await page.getByRole("button", { name: "Terbitkan Rekomendasi" }).click();
  const confirmDialog = page.getByRole("alertdialog");
  await expect(confirmDialog.getByRole("heading", { name: "Terbitkan batch rekomendasi?" })).toBeVisible();
  await confirmDialog.getByRole("button", { name: "Konfirmasi Terbitkan" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Batch diterbitkan" })).toBeVisible();
  await expect(page.getByText("Diterbitkan", { exact: true }).first()).toBeVisible();

  const invalidGatePatch = await sameOriginJson(page, "/api/admin/recommendation-engine", "PATCH", {
    autoProcessingEnabled: true, automaticPublicationEnabled: true, validationStatus: "VALIDATED"
  });
  expect(invalidGatePatch.status).toBe(422);
  const autoJobAttempt = await sameOriginJson(page, "/api/admin/recommendation-jobs", "POST", {
    datasetExportId, kNeighbors: 3, topN: 1, trigger: "AUTO_RATING_CHANGE", idempotencyKey: randomUUID()
  });
  expect(autoJobAttempt.status).toBe(422);
  const config = await query<{ autoProcessingEnabled: boolean; automaticPublicationEnabled: boolean; validationStatus: string }>(
    'SELECT "autoProcessingEnabled", "automaticPublicationEnabled", "validationStatus" FROM "RecommendationEngineConfig" WHERE id = 1'
  );
  expect(config.rows[0]).toEqual({ autoProcessingEnabled: false, automaticPublicationEnabled: false, validationStatus: "PENDING_VALIDATION" });

  const pendingJobs = await query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM "RecommendationJob" WHERE status IN ('PENDING', 'RUNNING')`);
  expect(Number(pendingJobs.rows[0]?.count), "E2E DB has unfinished jobs; preserve them and review before rerun").toBe(0);
  const workerId = `phase-f-${runId.slice(0, 12)}`;
  const createJob = await sameOriginJson(page, "/api/admin/recommendation-jobs", "POST", {
    datasetExportId, kNeighbors: 3, topN: 5, idempotencyKey: randomUUID()
  });
  expect(createJob.status).toBe(201);
  const jobId = createJob.body.data.id as string;
  const queued = await query<{ status: string; attemptCount: number }>('SELECT status, "attemptCount" FROM "RecommendationJob" WHERE id = $1', [jobId]);
  expect(queued.rows[0]).toEqual({ status: "PENDING", attemptCount: 0 });
  expect((await query('SELECT 1 FROM "RecommendationWorker" WHERE "workerId" = $1', [workerId])).rowCount).toBe(0);

  const badCredential = await page.request.post(`${baseURL}/api/internal/recommendation-jobs/claim`, {
    data: { workerId: `${workerId}-bad-secret`, engineVersion: "python-ubcf-v1" },
    headers: { authorization: "Bearer invalid-worker-credential-that-is-long-enough-000" }
  });
  expect(badCredential.status()).toBe(401);

  await query('UPDATE "Rating" SET rating = 3, "updatedAt" = now() WHERE "userId" = $1 AND "foodId" = $2', [userBId, food1Id]);
  const beforeBatchCount = Number((await query<{ count: string }>('SELECT COUNT(*)::text AS count FROM "RecommendationBatch"')).rows[0]?.count);
  const python = process.env.FOODREC_PYTHON ?? "python";
  let worker: ChildProcess | undefined;
  let workerLog = "";
  try {
    worker = spawn(python, ["-u", path.resolve("services/recommender/src/worker.py")], {
      cwd: process.cwd(),
      env: { ...process.env, FOODREC_WORKER_ID: workerId, FOODREC_WORKER_POLL_SECONDS: "0.5" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    worker.stdout?.on("data", (chunk: Buffer) => { workerLog += chunk.toString(); });
    worker.stderr?.on("data", (chunk: Buffer) => { workerLog += chunk.toString(); });
    await expect.poll(async () => {
      const state = await query<{ status: string }>('SELECT status FROM "RecommendationJob" WHERE id = $1', [jobId]);
      if (worker?.exitCode !== null && worker?.exitCode !== undefined) return `WORKER_EXITED_${worker.exitCode}: ${workerLog}`;
      return state.rows[0]?.status ?? "MISSING";
    }, { timeout: 60_000, intervals: [250, 500, 1_000] }).toBe("SUCCEEDED");
  } finally {
    if (worker && worker.exitCode === null) {
      worker.kill();
      await Promise.race([new Promise<void>((resolve) => worker?.once("exit", () => resolve())), delay(3_000)]);
    }
    await test.info().attach("python-worker-log", { body: Buffer.from(workerLog), contentType: "text/plain" });
  }

  const result = await query<{
    status: string;
    attemptCount: number;
    verificationStatus: string;
    sourceRatingRevision: string;
    currentRatingRevision: string;
    isStale: boolean;
    rowCount: number;
    payload: { recommendations?: unknown[] };
    artifactId: string;
  }>(`SELECT j.status, j."attemptCount", a."verificationStatus", a."sourceRatingRevision"::text, a."currentRatingRevision"::text, a."isStale", a."rowCount", a.payload, a.id AS "artifactId"
    FROM "RecommendationJob" j JOIN "RecommendationJobArtifact" a ON a."jobId" = j.id WHERE j.id = $1`, [jobId]);
  expect(result.rowCount).toBe(1);
  expect(result.rows[0]).toMatchObject({ status: "SUCCEEDED", attemptCount: 1, verificationStatus: "UNVERIFIED", isStale: true });
  expect(result.rows[0]?.sourceRatingRevision).not.toBe(result.rows[0]?.currentRatingRevision);
  expect(result.rows[0]?.rowCount).toBeGreaterThan(0);
  expect(result.rows[0]?.payload.recommendations?.length).toBeGreaterThan(0);
  expect(Number((await query<{ count: string }>('SELECT COUNT(*)::text AS count FROM "RecommendationBatch"')).rows[0]?.count)).toBe(beforeBatchCount);

  const artifactPublishAttempt = await sameOriginJson(page, `/api/admin/recommendation-batches/${result.rows[0]!.artifactId}/publish`, "POST", {});
  expect(artifactPublishAttempt.status).toBe(400);
  await page.goto("/admin/recommendations");
  const jobRow = monitor.locator("tr").filter({ hasText: jobId });
  await expect(jobRow.getByText("SUCCEEDED", { exact: true })).toBeVisible();
  await expect(jobRow.getByText("UNVERIFIED", { exact: true })).toBeVisible();
  await expect(jobRow.getByText("Stale", { exact: true })).toBeVisible();
  await expect(jobRow.getByText("Tidak diterbitkan otomatis", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Keluar" }).click();
  await expect(page).toHaveURL("/");
  await login(page, userAEmail, userAPassword);
  await page.goto("/recommendations");
  await expect(page.getByRole("heading", { name: "Rekomendasi Untukmu" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mie Goreng" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: path.join(screenshotDir, "user-published-recommendation-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Keluar" }).click();
});

test("Research consent, mobile rating, admin export checksum, and study closure", async ({ page }) => {
  await login(page, adminEmail, adminPassword);
  await page.goto("/admin/research");
  await expect(page.getByRole("heading", { name: "Pengumpulan Data Penelitian" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectAccessible(page);
  await page.screenshot({ path: path.join(screenshotDir, "research-admin-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  await expectAccessible(page);
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.getByRole("button", { name: "Buat penelitian" }).click();
  const title = `Studi browser ${runId.slice(0, 8)}`;
  const start = new Date(Date.now() - 60 * 60_000);
  const close = new Date(Date.now() + 7 * 24 * 60 * 60_000);
  const retention = new Date(Date.now() + 370 * 24 * 60 * 60_000);
  const localDateTime = (value: Date) => new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  await page.getByLabel("Judul penelitian").fill(title);
  await page.getByLabel("Versi persetujuan").fill("v1");
  await page.getByLabel("Penjelasan singkat").fill("Penelitian uji E2E untuk pengumpulan rating makanan secara sukarela.");
  await page.getByLabel("Tujuan pengumpulan").fill("Memverifikasi pengalaman persetujuan dan rating penelitian.");
  await page.getByLabel("Data yang dikumpulkan").fill("Rating 1–5 untuk makanan yang pernah dicoba.");
  await page.getByLabel("Penggunaan data").fill("Validasi teknis alur terisolasi pada database E2E.");
  await page.getByLabel("Cara berhenti/menarik data").fill("Buka halaman penelitian dan pilih tarik partisipasi.");
  await page.getByLabel("Teks persetujuan lengkap (ditampilkan apa adanya)").fill("Saya memahami penelitian dan bersedia ikut secara sukarela.");
  await page.getByLabel("Nama kontak penelitian").fill("Kontak Uji");
  await page.getByLabel("Email kontak penelitian").fill("research@example.test");
  await page.getByLabel("Mulai pengumpulan").fill(localDateTime(start));
  await page.getByLabel("Tutup pengumpulan").fill(localDateTime(close));
  await page.getByLabel("Batas retensi data").fill(localDateTime(retention));
  await page.getByLabel("Kebijakan retensi dan penanganan data").fill("Disimpan sampai batas retensi, lalu pemilik studi meninjau dan menghapus data.");
  await expectLabeledFormControls(page);
  await page.getByRole("button", { name: "Buat draft penelitian" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  const createdStudy = (await query<{ id: number }>('SELECT id FROM "ResearchStudy" WHERE title = $1', [title])).rows[0];
  if (!createdStudy) throw new Error("Created E2E study was not found in test database.");
  researchStudyUnderTest = createdStudy.id;
  await page.getByRole("button", { name: "Buka pengumpulan" }).click();
  await expect(page.getByText("OPEN", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Keluar" }).click();
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/research");
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByText("Kontak Uji (research@example.test)")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectAccessible(page);
  await page.getByRole("link", { name: "Buat akun" }).click();
  await expect(page).toHaveURL(/\/register\?callbackURL=%2Fresearch$/);
  await expectAccessible(page);
  await page.getByLabel("Nama lengkap").fill("QA Responden Penelitian");
  await page.getByLabel("Email", { exact: true }).fill(userCEmail);
  await page.getByLabel("Password", { exact: true }).fill(userCPassword);
  await page.getByLabel("Konfirmasi password").fill(userCPassword);
  await page.getByRole("button", { name: "Buat akun", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/research");
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByText("Ingin berpartisipasi?")).toHaveCount(0);

  await page.getByRole("button", { name: "Keluar" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await expect(page.getByRole("link", { name: "Masuk", exact: true }).first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/research");
  await expectNoHorizontalOverflow(page);
  await page.getByRole("link", { name: "Masuk", exact: true }).last().click();
  await expect(page).toHaveURL(/\/login\?callbackURL=%2Fresearch$/);
  await expectNoHorizontalOverflow(page);
  await expectAccessible(page);
  await page.getByLabel("Email").fill(userCEmail);
  await page.getByLabel("Password").fill(userCPassword);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/research");
  await page.setViewportSize({ width: 1440, height: 960 });
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  const consent = page.getByLabel(/Saya telah membaca dokumen persetujuan versi/);
  await expectAccessible(page);
  await expect(consent).not.toBeChecked();
  await consent.check();
  await page.getByRole("button", { name: "Setuju dan lanjutkan" }).click();
  await expect(page).toHaveURL(/\/research\/rate$/);
  await expectNoHorizontalOverflow(page);
  await expectAccessible(page);
  await page.getByLabel("Cari makanan").fill("Nasi Goreng");
  const group = page.getByRole("radiogroup", { name: "Rating Nasi Goreng" });
  await group.getByRole("radio", { name: "4 dari 5, suka" }).check({ force: true });
  await page.getByLabel("Saya pernah mencoba makanan ini.").check();
  await page.getByRole("button", { name: "Simpan rating penelitian" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Rating penelitian tersimpan." })).toBeVisible();
  await group.getByRole("radio", { name: "5 dari 5, sangat suka" }).check({ force: true });
  await page.getByRole("button", { name: "Simpan perubahan" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Rating penelitian tersimpan." })).toBeVisible();

  await page.getByLabel("Cari makanan").fill("Mie Goreng");
  const skippedGroup = page.getByRole("radiogroup", { name: "Rating Mie Goreng" });
  await skippedGroup.getByRole("radio", { name: "3 dari 5, biasa saja" }).check({ force: true });
  await expect(page.getByRole("button", { name: "Simpan rating penelitian" })).toBeDisabled();
  await expect(page.getByText("Rating penelitian tersimpan: 3/5")).toHaveCount(0);

  await page.goto("/research");
  await expect(page.getByText(/1 makanan sudah kamu nilai/)).toBeVisible();
  await page.getByRole("link", { name: "Lanjutkan penilaian" }).click();
  await expect(page).toHaveURL(/\/research\/rate$/);
  await expect(page.getByText("Rating penelitian tersimpan: 5/5")).toBeVisible();
  const resumedNasiCard = page.locator("section").filter({ has: page.getByRole("heading", { name: "Nasi Goreng", exact: true }) }).first();
  await expect(resumedNasiCard.getByLabel("Saya pernah mencoba makanan ini.")).toBeChecked();

  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  await expectAccessible(page);
  await page.getByLabel("Cari makanan").fill("Mie Goreng");
  const skippedMobileGroup = page.getByRole("radiogroup", { name: "Rating Mie Goreng" });
  await skippedMobileGroup.getByRole("radio", { name: "2 dari 5, kurang suka" }).check({ force: true });
  await expect(page.getByRole("button", { name: "Simpan rating penelitian" })).toBeDisabled();
  await page.getByLabel("Cari makanan").fill("Nasi Goreng");
  const mobileGroup = page.getByRole("radiogroup", { name: "Rating Nasi Goreng" });
  await expect(mobileGroup.getByRole("radio", { name: "5 dari 5, sangat suka" })).toBeChecked();
  const mobileNasiCard = page.locator("section").filter({ has: page.getByRole("heading", { name: "Nasi Goreng", exact: true }) }).first();
  await expect(mobileNasiCard.getByLabel("Saya pernah mencoba makanan ini.")).toBeChecked();
  await mobileGroup.getByRole("radio", { name: "4 dari 5, suka" }).check({ force: true });
  await page.getByRole("button", { name: "Simpan perubahan" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Rating penelitian tersimpan." })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: path.join(screenshotDir, "research-rating-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Selesaikan sesi" }).click();
  await expect(page.getByText(/Terima kasih atas partisipasimu/)).toBeVisible();

  await page.getByRole("button", { name: "Keluar" }).click();
  await page.setViewportSize({ width: 1440, height: 960 });
  await login(page, adminEmail, adminPassword);
  await page.goto("/admin/research");
  await expect(page.getByRole("button", { name: "Buat snapshot CSV + manifest" })).toBeVisible();
  await page.getByRole("button", { name: "Buat snapshot CSV + manifest" }).click();
  await expect(page.getByText(/Dataset versi 1 dibuat/)).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "CSV" }).click()
  ]);
  const savedFile = await download.path();
  expect(savedFile).toBeTruthy();
  const csv = await readFile(savedFile!);
  expect(csv.toString("utf8")).toMatch(/^user_id,food_id,rating\r\n\d+,\d+,4\r\n$/);
  const checksum = createHash("sha256").update(csv).digest("hex");
  const manifestHref = await page.getByRole("link", { name: "Manifest" }).first().getAttribute("href");
  expect(manifestHref).toBeTruthy();
  const manifestResponse = await page.request.get(new URL(manifestHref!, baseURL).toString());
  expect(manifestResponse.ok()).toBeTruthy();
  expect((await manifestResponse.json()).data.sha256).toBe(checksum);

  await page.getByRole("button", { name: "Keluar" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/research");
  await page.getByRole("link", { name: "Masuk", exact: true }).last().click();
  await page.getByLabel("Email").fill(userCEmail);
  await page.getByLabel("Password").fill(userCPassword);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/research");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Tarik partisipasi penelitian" }).click();
  await expect(page.getByText(/penarikan sedang diproses/)).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectAccessible(page);
  await page.screenshot({ path: path.join(screenshotDir, "research-withdrawal-mobile.png"), fullPage: true });

  await page.getByRole("button", { name: "Keluar" }).click();
  await page.setViewportSize({ width: 1440, height: 960 });
  await login(page, adminEmail, adminPassword);
  await page.goto("/admin/research");
  await expect(page.getByText("REVOCATION_REQUIRED", { exact: true })).toBeVisible();
  const handleRevocationDialogs = async (dialog: import("@playwright/test").Dialog) => {
    if (dialog.type() === "confirm") await dialog.accept();
    else if (dialog.type() === "prompt") await dialog.accept("Penerima uji diberi tahu saat pengujian E2E.");
  };
  page.on("dialog", handleRevocationDialogs);
  await page.getByRole("button", { name: "Proses revokasi" }).click();
  page.off("dialog", handleRevocationDialogs);
  await expect(page.getByText("REVOKED", { exact: true })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Proses penarikan" }).click();
  await expect(page.getByText("Tidak ada permintaan withdrawal tertunda.")).toBeVisible();
  await page.getByRole("button", { name: "Tutup pengumpulan" }).click();
  await expect(page.getByText("CLOSED", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Arsipkan studi" }).click();
  await expect(page.getByText("ARCHIVED", { exact: true })).toBeVisible();
});
