import { z } from "zod";

const databaseEnvironment = z.object({ DATABASE_URL: z.string().min(1) });

const applicationEnvironment = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(32),
  AUTH_URL: z.string().url(),
  FOODREC_WORKER_SECRET: z.string().min(32).optional(),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
  FOODREC_STORAGE_DIR: z.string().min(1).optional()
}).refine(({ ADMIN_EMAIL, ADMIN_PASSWORD }) => Boolean(ADMIN_EMAIL) === Boolean(ADMIN_PASSWORD), {
  message: "ADMIN_EMAIL and ADMIN_PASSWORD must be configured together"
});

const workerEnvironment = z.object({ FOODREC_WORKER_SECRET: z.string().min(32) });

export function readDatabaseUrl() {
  const databaseUrl = databaseEnvironment.parse(process.env).DATABASE_URL;
  const testRun = process.env.FOODREC_TEST_RUN;
  if (testRun || process.env.NODE_ENV === "test") {
    const testVariable = testRun === "integration" ? "FOODREC_TEST_DATABASE_URL" : testRun === "e2e" ? "FOODREC_E2E_DATABASE_URL" : undefined;
    const testUrl = testVariable ? process.env[testVariable] : undefined;
    const originalUrl = process.env.FOODREC_ORIGINAL_DATABASE_URL;
    if (!testUrl || !originalUrl || databaseUrl !== testUrl) {
      throw new Error("Test runtime requires an explicit isolated database URL matching DATABASE_URL.");
    }
    const target = new URL(testUrl);
    const source = new URL(originalUrl);
    const targetName = decodeURIComponent(target.pathname.replace(/^\//, ""));
    const sourceName = decodeURIComponent(source.pathname.replace(/^\//, ""));
    if (!/^[a-zA-Z0-9_]{1,63}$/.test(targetName) || !targetName.endsWith("_test") || targetName === sourceName ||
        target.protocol !== source.protocol || target.hostname !== source.hostname || target.port !== source.port ||
        target.username !== source.username || target.password !== source.password ||
        !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)) {
      throw new Error("Test runtime database must be a distinct _test database on the configured PostgreSQL target.");
    }
  }
  return databaseUrl;
}

export function readApplicationEnvironment() {
  return applicationEnvironment.parse(process.env);
}

export function readWorkerEnvironment() {
  return workerEnvironment.parse(process.env);
}
