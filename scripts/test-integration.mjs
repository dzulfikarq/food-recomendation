import "dotenv/config";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { readTestDatabaseTarget, verifyPostgresTarget } from "./test-database.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = process.env.FOODREC_NEXT_DIST_DIR ?? ".next";
if (!existsSync(path.join(root, buildDir, "BUILD_ID"))) {
  throw new Error(`No production build found in ${buildDir}. Run npm run build before integration tests.`);
}
const { url: testUrl, databaseName, sourceUrl } = readTestDatabaseTarget("FOODREC_TEST_DATABASE_URL");
const testTarget = new URL(testUrl);

const maintenanceUrl = new URL(testUrl);
maintenanceUrl.pathname = "/postgres";
maintenanceUrl.searchParams.delete("schema");
const client = new pg.Client({ connectionString: maintenanceUrl.toString() });
await client.connect();
const maintenanceServer = await verifyPostgresTarget(maintenanceUrl.toString(), "postgres", decodeURIComponent(testTarget.username));
try {
  const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName]);
  if (exists.rowCount === 0) {
    await client.query(`CREATE DATABASE "${databaseName}"`);
    console.info(`Created empty isolated integration database: ${databaseName}`);
  }
} finally {
  await client.end();
}
await verifyPostgresTarget(testUrl, databaseName, decodeURIComponent(testTarget.username), maintenanceServer);

const env = {
  ...process.env,
  FOODREC_ORIGINAL_DATABASE_URL: sourceUrl,
  FOODREC_TEST_DATABASE_URL: testUrl,
  DATABASE_URL: testUrl,
  FOODREC_TEST_RUN: "integration",
  NODE_ENV: "test",
  FOODREC_STORAGE_DIR: process.env.FOODREC_TEST_STORAGE_DIR ?? "./storage-test"
};
const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");
const commands = [
  [process.execPath, [prismaCli, "generate"]],
  [process.execPath, [prismaCli, "migrate", "deploy"]],
  [process.execPath, ["--import", "tsx", "prisma/seed.ts"]],
  [process.execPath, ["--import", "tsx", "prisma/seed-foods.ts"]],
  [process.execPath, ["--import", "tsx", "--test", "--test-concurrency=1", "tests/auth.integration.test.ts", "tests/foods.integration.test.ts", "tests/ratings.integration.test.ts", "tests/research.integration.test.ts", "tests/recommendation-jobs.integration.test.ts", "tests/recommendation-automation.integration.test.ts", "tests/recommendations.integration.test.ts"]]
];

console.info(`Using isolated FoodRec integration database: ${databaseName}`);
for (const [command, args] of commands) {
  await verifyPostgresTarget(testUrl, databaseName, decodeURIComponent(testTarget.username), maintenanceServer);
  const result = spawnSync(command, args, { cwd: root, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
