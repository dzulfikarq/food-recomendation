import "dotenv/config";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { readTestDatabaseTarget, verifyPostgresTarget } from "./test-database.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { url: testUrl, databaseName, sourceUrl: originalUrl } = readTestDatabaseTarget("FOODREC_E2E_DATABASE_URL");
const target = new URL(testUrl);
const originalName = decodeURIComponent(new URL(originalUrl).pathname.replace(/^\//, ""));

const maintenanceUrl = new URL(testUrl);
maintenanceUrl.pathname = "/postgres";
maintenanceUrl.searchParams.delete("schema");
const client = new pg.Client({ connectionString: maintenanceUrl.toString() });
await client.connect();
const maintenanceServer = await verifyPostgresTarget(maintenanceUrl.toString(), "postgres", decodeURIComponent(target.username));
try {
  const existing = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName]);
  if (existing.rowCount === 0) {
    await client.query(`CREATE DATABASE "${databaseName}"`);
    console.info(`Created isolated E2E database: ${databaseName}`);
  } else {
    console.info(`Reusing isolated E2E database without reset: ${databaseName}`);
  }
} finally {
  await client.end();
}
await verifyPostgresTarget(testUrl, databaseName, decodeURIComponent(target.username), maintenanceServer);

const baseUrl = "http://127.0.0.1:3110";
const runId = randomUUID();
const env = {
  ...process.env,
  DATABASE_URL: testUrl,
  FOODREC_E2E_DATABASE_URL: testUrl,
  FOODREC_TEST_DATABASE_URL: testUrl,
  FOODREC_ORIGINAL_DATABASE_URL: originalUrl,
  FOODREC_TEST_RUN: "e2e",
  NODE_ENV: "test",
  FOODREC_NEXT_DIST_DIR: process.env.FOODREC_NEXT_DIST_DIR || ".next-foodrec-phase-f",
  FOODREC_STORAGE_DIR: process.env.FOODREC_E2E_STORAGE_DIR || "foodrec-e2e-test",
  AUTH_URL: baseUrl,
  AUTH_SECRET: randomBytes(32).toString("hex"),
  FOODREC_WORKER_SECRET: randomBytes(32).toString("hex"),
  FOODREC_WORKER_API_URL: baseUrl,
  FOODREC_E2E_RUN_ID: runId,
  ADMIN_EMAIL: `phase-f-admin-${runId}@example.test`,
  ADMIN_PASSWORD: randomBytes(24).toString("base64url"),
  FOODREC_CHROME_PATH: process.env.FOODREC_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
};
if (!existsSync(env.FOODREC_CHROME_PATH)) throw new Error("Chrome not found; set FOODREC_CHROME_PATH to an installed Chromium browser.");

async function run(label, executable, args) {
  const commandDatabaseName = decodeURIComponent(new URL(env.DATABASE_URL).pathname.replace(/^\//, ""));
  if (commandDatabaseName !== databaseName || commandDatabaseName === originalName || !commandDatabaseName.endsWith("_test")) {
    throw new Error(`Refusing ${label}; DATABASE_URL does not match isolated test database.`);
  }
  await verifyPostgresTarget(testUrl, databaseName, decodeURIComponent(target.username), maintenanceServer);
  console.info(`\n[E2E] ${label}`);
  const commandEnv = label === "Build production app against isolated E2E database" ? { ...env, NODE_ENV: "production" } : env;
  const result = spawnSync(executable, args, { cwd: root, env: commandEnv, stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} exited with status ${result.status ?? "unknown"}.`);
}

const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");
const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
const playwrightCli = path.join(root, "node_modules", "@playwright", "test", "cli.js");
await run("Generate Prisma client", process.execPath, [prismaCli, "generate"]);
await run("Apply migrations to isolated E2E database", process.execPath, [prismaCli, "migrate", "deploy"]);
await run("Seed isolated E2E administrator", process.execPath, ["--import", "tsx", "prisma/seed.ts"]);
await run("Seed foods without changing existing Food Codes", process.execPath, ["--import", "tsx", "prisma/seed-foods.ts"]);
const nextEnvFile = path.join(root, "next-env.d.ts");
const nextEnvBeforeBuild = readFileSync(nextEnvFile);
const tsconfigFile = path.join(root, "tsconfig.json");
const tsconfigBeforeBuild = readFileSync(tsconfigFile);
try {
  await run("Build production app against isolated E2E database", process.execPath, [nextCli, "build"]);
} finally {
  if (!readFileSync(nextEnvFile).equals(nextEnvBeforeBuild)) writeFileSync(nextEnvFile, nextEnvBeforeBuild);
  if (!readFileSync(tsconfigFile).equals(tsconfigBeforeBuild)) writeFileSync(tsconfigFile, tsconfigBeforeBuild);
}
await run("Run Chromium journeys and real worker check", process.execPath, [playwrightCli, "test", "--config=playwright.config.ts"]);
