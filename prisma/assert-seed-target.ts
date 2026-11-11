import { readDatabaseUrl } from "@/lib/env";

export function assertSeedTarget() {
  const url = new URL(readDatabaseUrl());
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database.endsWith("_test") && process.env.FOODREC_ALLOW_MANUAL_SEED !== database) {
    throw new Error(`Refusing seed for ${database}; use an _test database or set FOODREC_ALLOW_MANUAL_SEED to that exact database name.`);
  }
}
