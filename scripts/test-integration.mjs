import "dotenv/config";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = process.env.FOODREC_NEXT_DIST_DIR ?? ".next";
if (!existsSync(path.join(root, buildDir, "BUILD_ID"))) {
  throw new Error(`No production build found in ${buildDir}. Run npm run build before integration tests.`);
}
const testUrl = process.env.FOODREC_TEST_DATABASE_URL || (() => {
  if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL or FOODREC_TEST_DATABASE_URL.");
  const url = new URL(process.env.DATABASE_URL);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  url.pathname = `/${database}_test`;
  return url.toString();
})();

const databaseName = decodeURIComponent(new URL(testUrl).pathname.replace(/^\//, ""));
if (!databaseName.endsWith("_test")) throw new Error("Refusing to use a database without the _test suffix.");
if (testUrl === process.env.DATABASE_URL) throw new Error("FOODREC_TEST_DATABASE_URL must differ from DATABASE_URL.");

const maintenanceUrl = new URL(testUrl);
maintenanceUrl.pathname = "/postgres";
const client = new pg.Client({ connectionString: maintenanceUrl.toString() });
await client.connect();
try {
  const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName]);
  if (exists.rowCount === 0) {
    await client.query(`CREATE DATABASE "${databaseName}"`);
    console.info(`Created empty isolated integration database: ${databaseName}`);
  }
} finally {
  await client.end();
}

const env = {
  ...process.env,
  FOODREC_ORIGINAL_DATABASE_URL: process.env.DATABASE_URL ?? "",
  FOODREC_TEST_DATABASE_URL: testUrl,
  DATABASE_URL: testUrl,
  FOODREC_STORAGE_DIR: process.env.FOODREC_TEST_STORAGE_DIR ?? "./storage-test"
};
const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");
const commands = [
  [process.execPath, [prismaCli, "generate"]],
  [process.execPath, [prismaCli, "migrate", "deploy"]],
  [process.execPath, ["--import", "tsx", "prisma/seed.ts"]],
  [process.execPath, ["--import", "tsx", "prisma/seed-foods.ts"]],
  [process.execPath, ["--import", "tsx", "--test", "--test-concurrency=1", "tests/auth.integration.test.ts", "tests/foods.integration.test.ts", "tests/ratings.integration.test.ts", "tests/recommendation-jobs.integration.test.ts", "tests/recommendation-automation.integration.test.ts", "tests/recommendations.integration.test.ts"]]
];

console.info(`Using isolated FoodRec integration database: ${databaseName}`);
for (const [command, args] of commands) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
