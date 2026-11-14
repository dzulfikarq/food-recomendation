import { randomBytes, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { expect, test } from "@playwright/test";
import pg from "pg";

const baseURL = process.env.AUTH_URL ?? "http://127.0.0.1:3110";

async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, values: unknown[] = []) {
  const client = new pg.Client({ connectionString: process.env.FOODREC_E2E_DATABASE_URL });
  await client.connect();
  try {
    return await client.query<T>(sql, values);
  } finally {
    await client.end();
  }
}

test("new USER rating automatically runs Python UBCF, verifies artifact, and sees recommendations", async ({ page }) => {
  const userEmail = `prototype-${randomUUID()}@example.test`;
  const password = randomBytes(18).toString("base64url");
  const foods = await query<{ id: number; foodCode: string; name: string }>(
    'SELECT id, "foodCode", name FROM "Food" WHERE "foodCode" IN ($1, $2) ORDER BY "foodCode"',
    ["FOOD-001", "FOOD-002"]
  );
  const targetFood = foods.rows.find(({ foodCode }) => foodCode === "FOOD-001");
  expect(targetFood).toBeTruthy();
  const workerId = `prototype-${randomUUID().slice(0, 12)}`;
  let worker: ChildProcess | undefined;
  let workerLog = "";

  try {
    const triggerConstraint = await query<{ definition: string }>(`SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint WHERE conrelid = '"RecommendationJob"'::regclass AND conname = 'RecommendationJob_trigger_check'`);
    expect(triggerConstraint.rows[0]?.definition).toContain("TEST_PROTOTYPE");

    worker = spawn(process.env.FOODREC_PYTHON || "python", ["-u", "services/recommender/src/worker.py"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        FOODREC_WORKER_API_URL: baseURL,
        FOODREC_WORKER_ID: workerId,
        FOODREC_WORKER_POLL_SECONDS: "0.5"
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    worker.stdout?.on("data", (chunk: Buffer) => { workerLog += chunk.toString(); });
    worker.stderr?.on("data", (chunk: Buffer) => { workerLog += chunk.toString(); });

    await page.goto("/register");
    await page.getByLabel("Nama lengkap").fill("Prototype User Baru");
    await page.getByLabel("Email", { exact: true }).fill(userEmail);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Konfirmasi password").fill(password);
    await page.getByRole("button", { name: "Buat akun", exact: true }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/");
    const user = await query<{ id: number }>('SELECT id FROM "User" WHERE email = $1', [userEmail]);
    const userId = user.rows[0]?.id;
    expect(userId).toBeGreaterThan(0);
    const revisionBefore = await query<{ currentRevision: string }>(
      'SELECT "currentRevision"::text FROM "RatingDatasetState" WHERE id = 1'
    );

    await page.goto("/foods");
    await page.getByLabel("Cari makanan").fill(targetFood!.name);
    await page.getByRole("button", { name: "Cari", exact: true }).click();
    const ratingGroup = page.locator("section").filter({ has: page.getByRole("heading", { name: targetFood!.name, exact: true }) }).first().getByRole("group");
    await ratingGroup.getByRole("radio", { name: "5 dari 5, sangat suka" }).check({ force: true });
    await ratingGroup.getByRole("button").click();
    await expect(ratingGroup.getByRole("status").filter({ hasText: "Rating berhasil disimpan." })).toBeVisible();

    await expect.poll(async () => {
      const jobs = await query<{ id: string; status: string }>(`SELECT id, status FROM "RecommendationJob"
        WHERE trigger = 'TEST_PROTOTYPE' AND parameters->'targetUserIds' @> to_jsonb(ARRAY[$1::int])
        ORDER BY "createdAt" DESC LIMIT 1`, [userId]);
      return jobs.rows[0] ?? null;
    }, { timeout: 20_000, intervals: [200, 400, 800] }).not.toBeNull();

    let jobRow = await query<{ id: string; status: string }>(`SELECT id, status FROM "RecommendationJob"
      WHERE trigger = 'TEST_PROTOTYPE' AND parameters->'targetUserIds' @> to_jsonb(ARRAY[$1::int])
      ORDER BY "createdAt" DESC LIMIT 1`, [userId]);
    expect(jobRow.rows[0]?.id).toBeTruthy();
    const jobId = jobRow.rows[0]!.id;
    await expect.poll(async () => {
      jobRow = await query<{ id: string; status: string }>('SELECT id, status FROM "RecommendationJob" WHERE id = $1', [jobId]);
      if (worker?.exitCode !== null && worker?.exitCode !== undefined) return `WORKER_EXITED_${worker.exitCode}: ${workerLog}`;
      return jobRow.rows[0]?.status ?? "MISSING";
    }, { timeout: 60_000, intervals: [250, 500, 1_000] }).toBe("SUCCEEDED");

    await expect.poll(async () => {
      const batch = await query<{ id: number }>(`SELECT id FROM "RecommendationBatch"
        WHERE status = 'PUBLISHED' AND "validationReport"->'artifactVerification'->>'jobId' = $1`, [jobId]);
      return batch.rowCount;
    }, { timeout: 15_000, intervals: [250, 500, 1_000] }).toBe(1);

    const evidence = await query<{
      verificationStatus: string;
      isStale: boolean;
      sourceRatingRevision: string;
      currentRatingRevision: string;
      rowCount: number;
      batchStatus: string;
      verification: { status: string };
      outcome: { status: string } | null;
    }>(`SELECT a."verificationStatus", a."isStale", a."sourceRatingRevision"::text, a."currentRatingRevision"::text,
      a."rowCount", b.status AS "batchStatus", b."validationReport"->'artifactVerification' AS verification,
      (SELECT outcome FROM jsonb_array_elements(b."validationReport"->'userStatuses') AS status_row(outcome)
        WHERE (outcome->>'userId')::int = $2) AS outcome
      FROM "RecommendationJobArtifact" a JOIN "RecommendationJob" j ON j.id = a."jobId"
      JOIN "RecommendationBatch" b ON b."validationReport"->'artifactVerification'->>'jobId' = j.id::text
      WHERE j.id = $1`, [jobId, userId]);
    expect(evidence.rows[0]).toMatchObject({
      verificationStatus: "UNVERIFIED",
      isStale: false,
      batchStatus: "PUBLISHED",
      verification: { status: "REVERIFIED_FOR_LOCAL_PROTOTYPE" },
      outcome: { status: "READY" }
    });
    expect(evidence.rows[0]?.sourceRatingRevision).toBe(evidence.rows[0]?.currentRatingRevision);
    expect(evidence.rows[0]?.rowCount).toBeGreaterThan(0);
    const gates = await query<{ autoProcessingEnabled: boolean; automaticPublicationEnabled: boolean; validationStatus: string }>(
      'SELECT "autoProcessingEnabled", "automaticPublicationEnabled", "validationStatus" FROM "RecommendationEngineConfig" WHERE id = 1'
    );
    expect(gates.rows[0]).toEqual({ autoProcessingEnabled: false, automaticPublicationEnabled: false, validationStatus: "PENDING_VALIDATION" });
    const ratedRecommendations = await query(`SELECT 1 FROM "Recommendation" r
      JOIN "RecommendationBatch" b ON b.id = r."batchId"
      JOIN "Rating" rating ON rating."userId" = r."userId" AND rating."foodId" = r."foodId"
      WHERE r."userId" = $1 AND b.status = 'PUBLISHED' AND b."validationReport"->'artifactVerification'->>'jobId' = $2`, [userId, jobId]);
    expect(ratedRecommendations.rowCount).toBe(0);
    const userRecommendations = await query<{ name: string }>(`SELECT food.name FROM "Recommendation" r
      JOIN "RecommendationBatch" b ON b.id = r."batchId" JOIN "Food" food ON food.id = r."foodId"
      WHERE r."userId" = $1 AND b.status = 'PUBLISHED' AND b."validationReport"->'artifactVerification'->>'jobId' = $2
      ORDER BY r.rank`, [userId, jobId]);
    expect(userRecommendations.rowCount).toBeGreaterThan(0);
    const revisionAfter = await query<{ currentRevision: string }>('SELECT "currentRevision"::text FROM "RatingDatasetState" WHERE id = 1');
    expect(BigInt(revisionAfter.rows[0]!.currentRevision)).toBeGreaterThan(BigInt(revisionBefore.rows[0]!.currentRevision));

    await page.goto("/recommendations");
    await expect(page.getByRole("heading", { name: "Rekomendasi Untukmu" })).toBeVisible();
    await expect(page.getByRole("heading", { name: userRecommendations.rows[0]!.name, exact: true })).toBeVisible();
  } finally {
    if (worker && worker.exitCode === null) {
      worker.kill();
      await Promise.race([new Promise<void>((resolve) => worker?.once("exit", () => resolve())), delay(3_000)]);
    }
    await test.info().attach("prototype-python-worker-log", { body: Buffer.from(workerLog), contentType: "text/plain" });
  }
});
