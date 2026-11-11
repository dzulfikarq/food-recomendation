import assert from "node:assert/strict";
import test from "node:test";
import { readTestDatabaseTarget } from "./test-database.mjs";

const source = "postgresql://foodrec:secret@localhost:5432/foodrec?schema=public";

function withTarget(target, nodeEnv, run) {
  const previousTarget = process.env.FOODREC_TEST_DATABASE_URL;
  const previousE2eTarget = process.env.FOODREC_E2E_DATABASE_URL;
  const previousNodeEnv = process.env.NODE_ENV;
  delete process.env.FOODREC_E2E_DATABASE_URL;
  if (target === undefined) delete process.env.FOODREC_TEST_DATABASE_URL;
  else process.env.FOODREC_TEST_DATABASE_URL = target;
  if (nodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = nodeEnv;
  try {
    return run();
  } finally {
    if (previousTarget === undefined) delete process.env.FOODREC_TEST_DATABASE_URL;
    else process.env.FOODREC_TEST_DATABASE_URL = previousTarget;
    if (previousE2eTarget === undefined) delete process.env.FOODREC_E2E_DATABASE_URL;
    else process.env.FOODREC_E2E_DATABASE_URL = previousE2eTarget;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
}

test("test target requires an explicit, distinct _test database on the same server", () => {
  withTarget("postgresql://foodrec:secret@localhost:5432/foodrec_test?schema=public", undefined, () => {
    assert.equal(readTestDatabaseTarget("FOODREC_TEST_DATABASE_URL", source).databaseName, "foodrec_test");
  });
  withTarget(undefined, undefined, () => assert.throws(() => readTestDatabaseTarget("FOODREC_TEST_DATABASE_URL", source), /Set FOODREC_TEST_DATABASE_URL explicitly/));
  withTarget("postgresql://foodrec:secret@localhost:5432/foodrec?schema=public", undefined, () => assert.throws(() => readTestDatabaseTarget("FOODREC_TEST_DATABASE_URL", source), /distinct PostgreSQL database ending in _test/));
  withTarget("postgresql://foodrec:secret@other-host:5432/foodrec_test?schema=public", undefined, () => assert.throws(() => readTestDatabaseTarget("FOODREC_TEST_DATABASE_URL", source), /same PostgreSQL server/));
  withTarget("postgresql://foodrec:secret@other-host:5432/foodrec_test?schema=public", undefined, () => assert.throws(() => readTestDatabaseTarget("FOODREC_TEST_DATABASE_URL", "postgresql://foodrec:secret@other-host:5432/foodrec"), /local PostgreSQL server/));
  withTarget("postgresql://foodrec:secret@127.0.0.1:5432/foodrec_test?schema=public", undefined, () => assert.throws(() => readTestDatabaseTarget("FOODREC_TEST_DATABASE_URL", source), /same PostgreSQL server/));
  withTarget("postgresql://foodrec:secret@localhost:5432/foodrec_test?schema=public", "production", () => assert.throws(() => readTestDatabaseTarget("FOODREC_TEST_DATABASE_URL", source), /NODE_ENV=production/));
  withTarget("postgresql://foodrec:secret@localhost:5432/foodrec_test?schema=public", undefined, () => {
    process.env.FOODREC_E2E_DATABASE_URL = "postgresql://foodrec:secret@localhost:5432/foodrec_test?schema=public";
    assert.throws(() => readTestDatabaseTarget("FOODREC_TEST_DATABASE_URL", source), /separate test databases/);
  });
});
