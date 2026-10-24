const testUrl = process.env.FOODREC_TEST_DATABASE_URL;
if (!testUrl) throw new Error("Set FOODREC_TEST_DATABASE_URL to an isolated PostgreSQL database ending in _test.");

const testDatabase = decodeURIComponent(new URL(testUrl).pathname.replace(/^\//, ""));
if (!testDatabase.endsWith("_test")) throw new Error("Integration tests only run against a database whose name ends in _test.");
if (testUrl === process.env.FOODREC_ORIGINAL_DATABASE_URL) throw new Error("FOODREC_TEST_DATABASE_URL must differ from DATABASE_URL.");

Reflect.set(process.env, "DATABASE_URL", testUrl);

export const isolatedTestDatabase = testDatabase;
