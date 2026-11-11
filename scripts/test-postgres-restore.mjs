import "dotenv/config";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { readTestDatabaseTarget, verifyPostgresTarget } from "./test-database.mjs";

const stage = { name: "validate test target" };
let scratchName;
let scratchCreated = false;
let maintenance;
let scratch;
let tempDirectory;

function runPostgresTool(tool, args, env) {
  const result = spawnSync(tool, args, { env, encoding: "utf8", windowsHide: true });
  if (result.error || result.status !== 0) {
    const code = result.error?.code ?? result.status ?? "unknown";
    throw new Error(`${tool} failed (${code})`);
  }
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

async function tableCounts(client) {
  const tables = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
  const counts = new Map();
  for (const { tablename } of tables.rows) {
    const result = await client.query(`SELECT count(*)::text AS count FROM public.${quoteIdentifier(tablename)}`);
    counts.set(tablename, result.rows[0].count);
  }
  return counts;
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("refusing production runtime");
  const { url, databaseName } = readTestDatabaseTarget("FOODREC_TEST_DATABASE_URL");
  const target = new URL(url);
  const user = decodeURIComponent(target.username);
  scratchName = `foodrec_restore_${randomUUID().replaceAll("-", "")}_test`;
  const maintenanceUrl = new URL(url);
  maintenanceUrl.pathname = "/postgres";
  maintenanceUrl.searchParams.delete("schema");
  maintenance = new pg.Client({ connectionString: maintenanceUrl.toString() });
  await maintenance.connect();
  const server = await verifyPostgresTarget(maintenanceUrl.toString(), "postgres", user);
  await verifyPostgresTarget(url, databaseName, user, server);
  const existing = await maintenance.query("SELECT 1 FROM pg_database WHERE datname = $1", [scratchName]);
  if (existing.rowCount) throw new Error("scratch database collision");

  tempDirectory = await mkdtemp(path.join(os.tmpdir(), "foodrec-postgres-restore-"));
  if (process.platform !== "win32") await chmod(tempDirectory, 0o700);
  const dumpPath = path.join(tempDirectory, "foodrec-test.dump");
  const dumpEnvironment = {
    ...process.env,
    PGHOST: target.hostname.replace(/^\[|\]$/g, ""),
    PGPORT: target.port || "5432",
    PGUSER: user,
    PGPASSWORD: decodeURIComponent(target.password),
    PGDATABASE: databaseName,
    PGSSLMODE: target.searchParams.get("sslmode") ?? "prefer"
  };

  stage.name = "dump isolated _test database";
  runPostgresTool("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", `--file=${dumpPath}`, `--dbname=${databaseName}`], dumpEnvironment);
  if ((await stat(dumpPath)).size === 0) throw new Error("empty backup archive");
  stage.name = "create disposable _test restore database";
  await maintenance.query(`CREATE DATABASE ${quoteIdentifier(scratchName)}`);
  scratchCreated = true;

  stage.name = "restore archive into disposable _test database";
  runPostgresTool("pg_restore", ["--exit-on-error", "--no-owner", "--no-privileges", `--dbname=${scratchName}`, dumpPath], dumpEnvironment);
  stage.name = "compare public table row counts";
  scratch = new pg.Client({ connectionString: new URL(scratchName, url).toString() });
  await scratch.connect();
  const source = new pg.Client({ connectionString: url });
  await source.connect();
  try {
    const sourceCounts = await tableCounts(source);
    const restoredCounts = await tableCounts(scratch);
    if (sourceCounts.size === 0 || sourceCounts.size !== restoredCounts.size) throw new Error("table count mismatch");
    for (const [table, count] of sourceCounts) {
      if (restoredCounts.get(table) !== count) throw new Error("row count mismatch");
    }
    console.info(`Isolated PostgreSQL backup/restore passed: ${sourceCounts.size} public tables verified; temporary dump removed.`);
  } finally {
    await source.end();
  }
}

try {
  await main();
} catch (error) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "check-failed";
  console.error(`Isolated PostgreSQL restore test failed during ${stage.name} (${code}).`);
  process.exitCode = 1;
} finally {
  await scratch?.end().catch(() => undefined);
  if (scratchCreated && maintenance && scratchName) {
    await maintenance.query(`DROP DATABASE ${quoteIdentifier(scratchName)} WITH (FORCE)`).catch(() => {
      console.error("Could not remove disposable restore database; inspect only foodrec_restore_*_test on local PostgreSQL.");
      process.exitCode = 1;
    });
  }
  await maintenance?.end().catch(() => undefined);
  if (tempDirectory) await rm(tempDirectory, { recursive: true, force: true });
}
