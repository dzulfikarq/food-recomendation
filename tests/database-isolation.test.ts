import assert from "node:assert/strict";
import test from "node:test";
import { readDatabaseUrl } from "@/lib/env";

const keys = ["DATABASE_URL", "FOODREC_ORIGINAL_DATABASE_URL", "FOODREC_TEST_RUN", "FOODREC_TEST_DATABASE_URL", "FOODREC_E2E_DATABASE_URL", "NODE_ENV"] as const;

function withEnv(values: Partial<Record<(typeof keys)[number], string>>, run: () => void) {
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) {
    const value = values[key];
    if (value === undefined) Reflect.deleteProperty(process.env, key);
    else Reflect.set(process.env, key, value);
  }
  try {
    run();
  } finally {
    for (const key of keys) {
      const value = previous[key];
      if (value === undefined) Reflect.deleteProperty(process.env, key);
      else Reflect.set(process.env, key, value);
    }
  }
}

test("Prisma runtime accepts only explicit isolated URL during test runs", () => {
  const source = "postgresql://foodrec:secret@localhost:5432/foodrec?schema=public";
  const target = "postgresql://foodrec:secret@localhost:5432/foodrec_test?schema=public";
  withEnv({ DATABASE_URL: target, FOODREC_ORIGINAL_DATABASE_URL: source, FOODREC_TEST_RUN: "integration", FOODREC_TEST_DATABASE_URL: target }, () => {
    assert.equal(readDatabaseUrl(), target);
  });
  withEnv({ DATABASE_URL: source, FOODREC_ORIGINAL_DATABASE_URL: source, NODE_ENV: "test" }, () => {
    assert.throws(() => readDatabaseUrl(), /explicit isolated database URL/);
  });
  withEnv({ DATABASE_URL: source, FOODREC_ORIGINAL_DATABASE_URL: source, FOODREC_TEST_RUN: "integration", FOODREC_TEST_DATABASE_URL: source }, () => {
    assert.throws(() => readDatabaseUrl(), /distinct _test database/);
  });
  withEnv({ DATABASE_URL: target, FOODREC_ORIGINAL_DATABASE_URL: source, FOODREC_TEST_RUN: "integration" }, () => {
    assert.throws(() => readDatabaseUrl(), /explicit isolated database URL/);
  });
  withEnv({ DATABASE_URL: target, FOODREC_ORIGINAL_DATABASE_URL: "postgresql://foodrec:secret@other-host:5432/foodrec", FOODREC_TEST_RUN: "integration", FOODREC_TEST_DATABASE_URL: target }, () => {
    assert.throws(() => readDatabaseUrl(), /configured PostgreSQL target/);
  });
});
