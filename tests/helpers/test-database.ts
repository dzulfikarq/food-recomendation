import pg from "pg";

const testUrl = process.env.FOODREC_TEST_DATABASE_URL;
if (!testUrl) throw new Error("Set FOODREC_TEST_DATABASE_URL to an isolated PostgreSQL database ending in _test.");
if (process.env.FOODREC_TEST_RUN !== "integration") throw new Error("Integration tests must run through the isolated test runner.");
const originalUrl = process.env.FOODREC_ORIGINAL_DATABASE_URL;
if (!originalUrl) throw new Error("Test runner must provide FOODREC_ORIGINAL_DATABASE_URL for target comparison.");
if (process.env.DATABASE_URL !== testUrl) throw new Error("DATABASE_URL must be set to FOODREC_TEST_DATABASE_URL before integration tests.");

const target = new URL(testUrl);
const source = new URL(originalUrl);
const testDatabase = decodeURIComponent(target.pathname.replace(/^\//, ""));
const sourceDatabase = decodeURIComponent(source.pathname.replace(/^\//, ""));
if (!/^[a-zA-Z0-9_]{1,63}$/.test(testDatabase) || !testDatabase.endsWith("_test") || testDatabase === sourceDatabase ||
    target.protocol !== source.protocol || target.hostname !== source.hostname || target.port !== source.port ||
    target.username !== source.username || target.password !== source.password ||
    !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)) {
  throw new Error("Integration tests require a distinct _test database on the configured PostgreSQL target.");
}

const client = new pg.Client({ connectionString: testUrl });
await client.connect();
try {
  const { rows: [identity] } = await client.query("SELECT current_database() AS database, current_user AS username");
  if (identity.database !== testDatabase || identity.username !== decodeURIComponent(target.username)) {
    throw new Error(`Refusing integration target: connected to ${identity.database} as ${identity.username}.`);
  }
} finally {
  await client.end();
}

Reflect.set(process.env, "DATABASE_URL", testUrl);

export const isolatedTestDatabase = testDatabase;
