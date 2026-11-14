import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { parse } from "dotenv";
import { readTestDatabaseTarget, verifyPostgresTarget } from "./test-database.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2];
if (!["app", "worker"].includes(mode)) {
  throw new Error("Usage: node scripts/start-local-prototype.mjs <app|worker>");
}
if (process.env.NODE_ENV === "production") throw new Error("Local prototype launcher refuses NODE_ENV=production.");

const envPath = path.join(root, ".env");
if (!existsSync(envPath)) throw new Error("Copy .env.example to .env and configure local PostgreSQL first.");
const fileEnv = parse(readFileSync(envPath));
if (fileEnv.NODE_ENV === "production") throw new Error("Local prototype launcher refuses NODE_ENV=production.");
const sourceValue = process.env.DATABASE_URL ?? fileEnv.DATABASE_URL;
const targetValue = process.env.FOODREC_E2E_DATABASE_URL ?? fileEnv.FOODREC_E2E_DATABASE_URL;
const authSecret = process.env.AUTH_SECRET ?? fileEnv.AUTH_SECRET;
const workerSecret = process.env.FOODREC_WORKER_SECRET ?? fileEnv.FOODREC_WORKER_SECRET;
if (!sourceValue || !targetValue || !authSecret || authSecret.length < 32 || !workerSecret || workerSecret.length < 32) {
  throw new Error("Set DATABASE_URL, AUTH_SECRET, and FOODREC_WORKER_SECRET in .env; secrets must be at least 32 characters.");
}
const sourceUrl = new URL(sourceValue);
const targetUrl = new URL(targetValue);

process.env.DATABASE_URL = targetUrl.toString();
process.env.FOODREC_E2E_DATABASE_URL = targetUrl.toString();
process.env.FOODREC_ORIGINAL_DATABASE_URL = sourceUrl.toString();
process.env.FOODREC_TEST_DATABASE_URL = process.env.FOODREC_TEST_DATABASE_URL || fileEnv.FOODREC_TEST_DATABASE_URL || "";
process.env.FOODREC_TEST_RUN = "e2e";
const target = readTestDatabaseTarget("FOODREC_E2E_DATABASE_URL", sourceUrl.toString());
const databaseName = target.databaseName;

const maintenanceUrl = new URL(target.url);
maintenanceUrl.pathname = "/postgres";
maintenanceUrl.searchParams.delete("schema");
const maintenance = new pg.Client({ connectionString: maintenanceUrl.toString() });
await maintenance.connect();
let server;
try {
  server = await verifyPostgresTarget(
    maintenanceUrl.toString(), "postgres", decodeURIComponent(new URL(target.url).username)
  );
  const exists = await maintenance.query("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName]);
  if (!exists.rowCount) throw new Error(`Local prototype database ${databaseName} does not exist. Prepare it first.`);
} finally {
  await maintenance.end();
}
await verifyPostgresTarget(target.url, databaseName, decodeURIComponent(new URL(target.url).username), server);

const client = new pg.Client({ connectionString: target.url });
await client.connect();
try {
  const [config] = (await client.query(`SELECT "autoProcessingEnabled", "automaticPublicationEnabled", "validationStatus"
    FROM "RecommendationEngineConfig" WHERE id = 1`)).rows;
  if (!config || config.autoProcessingEnabled || config.automaticPublicationEnabled || config.validationStatus !== "PENDING_VALIDATION") {
    throw new Error("Prototype requires closed recommendation gates and PENDING_VALIDATION; no gate was changed.");
  }

  const [guard] = (await client.query(`SELECT trigger_row.tgenabled, pg_get_functiondef(trigger_row.tgfoid) AS definition
    FROM pg_trigger AS trigger_row
    WHERE trigger_row.tgrelid = '"RecommendationJob"'::regclass
      AND lower(trigger_row.tgname) = lower('RecommendationJob_block_automatic_processing')`)).rows;
  if (!guard || guard.tgenabled !== "O" || !guard.definition.includes("AUTO_RATING_CHANGE")) {
    throw new Error("Database automatic-processing protection is missing or disabled; refusing prototype startup.");
  }

  const [data] = (await client.query(`SELECT
    (SELECT count(*)::int FROM "User" WHERE role = 'ADMIN') AS admins,
    (SELECT count(*)::int FROM "Food" WHERE "isActive" = true) AS active_foods`)).rows;
  if (!data.admins || !data.active_foods) {
    throw new Error("Prototype DB needs an ADMIN and active foods. Add user ratings after starting the app.");
  }

  const readConstraints = async () => (await client.query(`SELECT conname, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint WHERE conrelid = '"RecommendationJob"'::regclass
      AND conname IN ('RecommendationJob_trigger_check', 'RecommendationJob_automatic_dedupe_check')`)).rows;
  let constraints = await readConstraints();
  const allowsPrototype = constraints.length === 2 && constraints.every(({ definition }) => definition.includes("TEST_PROTOTYPE"));
  if (!allowsPrototype) {
    if (mode !== "app") throw new Error("Start prototype app first; only app mode prepares the isolated TEST_PROTOTYPE constraint.");
    await client.query("BEGIN");
    try {
      await client.query(`
        ALTER TABLE "RecommendationJob" DROP CONSTRAINT IF EXISTS "RecommendationJob_trigger_check";
        ALTER TABLE "RecommendationJob" ADD CONSTRAINT "RecommendationJob_trigger_check"
          CHECK ("trigger" IN ('MANUAL_ADMIN', 'AUTO_RATING_CHANGE', 'TEST_PROTOTYPE'));
        ALTER TABLE "RecommendationJob" DROP CONSTRAINT IF EXISTS "RecommendationJob_automatic_dedupe_check";
        ALTER TABLE "RecommendationJob" ADD CONSTRAINT "RecommendationJob_automatic_dedupe_check"
          CHECK (
            ("trigger" = 'MANUAL_ADMIN' AND "automaticDedupeKey" IS NULL) OR
            ("trigger" IN ('AUTO_RATING_CHANGE', 'TEST_PROTOTYPE') AND "automaticDedupeKey" IS NOT NULL)
          );
      `);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
    constraints = await readConstraints();
    if (constraints.length !== 2 || !constraints.every(({ definition }) => definition.includes("TEST_PROTOTYPE"))) {
      throw new Error("Could not enable TEST_PROTOTYPE constraint in isolated database.");
    }
  }
} finally {
  await client.end();
}

const port = process.env.FOODREC_LOCAL_PROTOTYPE_PORT ?? fileEnv.FOODREC_LOCAL_PROTOTYPE_PORT ?? "3113";
if (!/^\d{1,5}$/.test(port) || Number(port) < 1024 || Number(port) > 65535) {
  throw new Error("FOODREC_LOCAL_PROTOTYPE_PORT must be a valid port from 1024 to 65535.");
}
const baseUrl = `http://127.0.0.1:${port}`;
const runtimeEnv = {
  ...fileEnv,
  ...process.env,
  DATABASE_URL: target.url,
  FOODREC_E2E_DATABASE_URL: target.url,
  FOODREC_ORIGINAL_DATABASE_URL: sourceUrl.toString(),
  FOODREC_TEST_RUN: "e2e",
  FOODREC_TEST_AUTO_RECOMMENDATIONS: "1",
  FOODREC_E2E_RUN_ID: crypto.randomUUID(),
  AUTH_URL: baseUrl,
  FOODREC_WORKER_API_URL: baseUrl,
  FOODREC_STORAGE_DIR: "foodrec-local-prototype",
  ...(mode === "app" ? { FOODREC_NEXT_DIST_DIR: "storage/foodrec-local-prototype-next" } : {}),
  FOODREC_WORKER_ID: "local-prototype-worker",
  AUTH_SECRET: authSecret,
  FOODREC_WORKER_SECRET: workerSecret
};
delete runtimeEnv.NODE_ENV;

console.info(`Local prototype target verified: ${databaseName}; gates remain OFF/PENDING_VALIDATION.`);
if (mode === "app") console.info(`Starting Next.js at ${baseUrl}; open that URL after server is ready.`);
else console.info("Starting Python worker; keep this terminal open while using the app.");

const executable = mode === "app" ? process.execPath : "powershell.exe";
const args = mode === "app"
  ? [path.join(root, "node_modules", "next", "dist", "bin", "next"), "dev", "--hostname", "127.0.0.1", "--port", port]
  : ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(root, "scripts", "run-recommender-worker.ps1")];
const result = spawnSync(executable, args, { cwd: root, env: runtimeEnv, stdio: "inherit", windowsHide: false });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
