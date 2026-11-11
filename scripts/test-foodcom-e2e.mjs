import "dotenv/config";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { readTestDatabaseTarget, verifyPostgresTarget } from "./test-database.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { url: testUrl, databaseName, sourceUrl } = readTestDatabaseTarget("FOODREC_FOODCOM_E2E_DATABASE_URL");
const preparedDir = process.env.FOODREC_FOODCOM_PREPARED_DIR;
const rawRecipes = process.env.FOODREC_RAW_RECIPES;
const exportDir = process.env.FOODREC_FOODCOM_EXPORT_DIR;
if (!preparedDir || !rawRecipes || !exportDir || !existsSync(preparedDir) || !existsSync(rawRecipes) || existsSync(exportDir)) {
  throw new Error("Set prepared subset, local RAW_recipes.csv, and a new non-existing FOODREC_FOODCOM_EXPORT_DIR.");
}

const target = new URL(testUrl);
const maintenanceUrl = new URL(testUrl);
maintenanceUrl.pathname = "/postgres";
maintenanceUrl.searchParams.delete("schema");
const maintenance = new pg.Client({ connectionString: maintenanceUrl.toString() });
await maintenance.connect();
const maintenanceServer = await verifyPostgresTarget(maintenanceUrl.toString(), "postgres", decodeURIComponent(target.username));
try {
  const existing = await maintenance.query("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName]);
  if (existing.rowCount) throw new Error(`Refusing to reuse existing database ${databaseName}; choose a new _test database. No data was changed.`);
  await maintenance.query(`CREATE DATABASE "${databaseName}"`);
  console.info(`Created new isolated Food.com E2E database: ${databaseName}`);
} finally {
  await maintenance.end();
}
await verifyPostgresTarget(testUrl, databaseName, decodeURIComponent(target.username), maintenanceServer);

const port = "3111";
const runId = randomUUID();
const env = {
  ...process.env,
  DATABASE_URL: testUrl,
  FOODREC_E2E_DATABASE_URL: testUrl,
  FOODREC_FOODCOM_E2E_DATABASE_URL: testUrl,
  FOODREC_ORIGINAL_DATABASE_URL: sourceUrl,
  FOODREC_TEST_RUN: "e2e",
  FOODREC_NEXT_DIST_DIR: ".next-foodrec-foodcom",
  FOODREC_E2E_PORT: port,
  FOODREC_E2E_OUTPUT_DIR: "test-results/foodcom",
  FOODREC_STORAGE_DIR: "foodrec-foodcom-e2e-test",
  AUTH_URL: `http://127.0.0.1:${port}`,
  AUTH_SECRET: randomBytes(32).toString("hex"),
  FOODREC_WORKER_SECRET: randomBytes(32).toString("hex"),
  FOODREC_WORKER_API_URL: `http://127.0.0.1:${port}`,
  FOODREC_E2E_RUN_ID: runId,
  ADMIN_EMAIL: `foodcom-admin-${runId}@example.test`,
  ADMIN_PASSWORD: randomBytes(24).toString("base64url"),
  FOODREC_CHROME_PATH: process.env.FOODREC_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
};
if (!existsSync(env.FOODREC_CHROME_PATH)) throw new Error("Chrome not found; set FOODREC_CHROME_PATH to an installed Chromium browser.");

async function run(label, executable, args) {
  const commandDatabaseName = decodeURIComponent(new URL(env.DATABASE_URL).pathname.replace(/^\//, ""));
  if (commandDatabaseName !== databaseName || commandDatabaseName === decodeURIComponent(new URL(sourceUrl).pathname.replace(/^\//, "")) || !commandDatabaseName.endsWith("_test")) {
    throw new Error(`Refusing ${label}; DATABASE_URL does not match new isolated test database.`);
  }
  await verifyPostgresTarget(testUrl, databaseName, decodeURIComponent(target.username), maintenanceServer);
  console.info(`\n[Food.com E2E] ${label}`);
  const result = spawnSync(executable, args, { cwd: root, env, stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} exited with status ${result.status ?? "unknown"}.`);
}

const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");
const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
const playwrightCli = path.join(root, "node_modules", "@playwright", "test", "cli.js");
const python = process.env.FOODREC_PYTHON || "python";
await run("Export verified local Food.com subset", python, [
  "services/recommender/scripts/export_foodcom_catalog.py",
  "--prepared-dir", preparedDir,
  "--raw-recipes", rawRecipes,
  "--output-dir", exportDir,
]);
await run("Generate Prisma client", process.execPath, [prismaCli, "generate"]);
await run("Apply migrations to new isolated database", process.execPath, [prismaCli, "migrate", "deploy"]);
await run("Seed isolated E2E administrator only", process.execPath, ["--import", "tsx", "prisma/seed.ts"]);
await run("Import Food.com catalog and training-only ratings", process.execPath, ["--import", "tsx", "scripts/import-foodcom-catalog.ts", exportDir, "--apply"]);
const e2eClient = new pg.Client({ connectionString: testUrl });
await e2eClient.connect();
let beforeRetry;
try {
  beforeRetry = await e2eClient.query(`
    SELECT (SELECT COUNT(*) FROM "Food" WHERE "sourceDataset" = 'FOODCOM')::text AS recipes,
           (SELECT COUNT(*) FROM "HistoricalRating")::text AS ratings,
           (SELECT COUNT(*) FROM "FoodCatalogImport")::text AS imports
  `);
} finally {
  await e2eClient.end();
}
await run("Repeat import to verify idempotency", process.execPath, ["--import", "tsx", "scripts/import-foodcom-catalog.ts", exportDir, "--apply"]);
const retryClient = new pg.Client({ connectionString: testUrl });
await retryClient.connect();
try {
  const afterRetry = await retryClient.query(`
    SELECT (SELECT COUNT(*) FROM "Food" WHERE "sourceDataset" = 'FOODCOM')::text AS recipes,
           (SELECT COUNT(*) FROM "HistoricalRating")::text AS ratings,
           (SELECT COUNT(*) FROM "FoodCatalogImport")::text AS imports
  `);
  if (JSON.stringify(afterRetry.rows[0]) !== JSON.stringify(beforeRetry.rows[0])) {
    throw new Error("Repeated Food.com import changed catalog, rating, or import counts.");
  }
} finally {
  await retryClient.end();
}

const nextEnvFile = path.join(root, "next-env.d.ts");
const tsconfigFile = path.join(root, "tsconfig.json");
const nextEnvBeforeBuild = readFileSync(nextEnvFile);
const tsconfigBeforeBuild = readFileSync(tsconfigFile);
try {
  await run("Build app against isolated Food.com database", process.execPath, [nextCli, "build"]);
} finally {
  if (!readFileSync(nextEnvFile).equals(nextEnvBeforeBuild)) writeFileSync(nextEnvFile, nextEnvBeforeBuild);
  if (!readFileSync(tsconfigFile).equals(tsconfigBeforeBuild)) writeFileSync(tsconfigFile, tsconfigBeforeBuild);
}
await run("Run Food.com browser, rating, and real-worker workflow", process.execPath, [playwrightCli, "test", "--config=playwright.config.ts", "tests/e2e/foodcom.spec.ts"]);
