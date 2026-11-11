import pg from "pg";

export function readTestDatabaseTarget(variable, sourceUrl = process.env.DATABASE_URL) {
  const rawTarget = process.env[variable];
  if (!rawTarget) throw new Error(`Set ${variable} explicitly; test database URLs are never derived.`);
  if (!sourceUrl) throw new Error("Set DATABASE_URL to identify the non-test source environment.");
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to start test runner with NODE_ENV=production.");

  const source = new URL(sourceUrl);
  const target = new URL(rawTarget);
  const databaseName = decodeURIComponent(target.pathname.replace(/^\//, ""));
  const sourceName = decodeURIComponent(source.pathname.replace(/^\//, ""));
  if (!/^[a-zA-Z0-9_]{1,63}$/.test(databaseName) || !databaseName.endsWith("_test") || databaseName === sourceName) {
    throw new Error(`${variable} must name a distinct PostgreSQL database ending in _test.`);
  }
  if (target.protocol !== source.protocol || target.hostname !== source.hostname || target.port !== source.port || target.username !== source.username || target.password !== source.password) {
    throw new Error(`${variable} must use the same PostgreSQL server and credentials as DATABASE_URL.`);
  }
  if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)) {
    throw new Error(`${variable} must use a local PostgreSQL server; remote targets are refused.`);
  }
  const companionVariable = variable === "FOODREC_TEST_DATABASE_URL" ? "FOODREC_E2E_DATABASE_URL" : "FOODREC_TEST_DATABASE_URL";
  const companion = process.env[companionVariable];
  if (companion) {
    const other = new URL(companion);
    if (target.hostname === other.hostname && target.port === other.port && target.username === other.username &&
        target.password === other.password && databaseName === decodeURIComponent(other.pathname.replace(/^\//, ""))) {
      throw new Error(`${variable} and ${companionVariable} must use separate test databases.`);
    }
  }

  return { url: target.toString(), databaseName, sourceUrl };
}

export async function verifyPostgresTarget(connectionString, expectedDatabase, expectedUser, expectedServer) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const { rows: [identity] } = await client.query("SELECT current_database() AS database, current_user AS username, inet_server_addr()::text AS address, inet_server_port() AS port");
    if (identity.database !== expectedDatabase || identity.username !== expectedUser || !identity.address || !identity.port) {
      throw new Error(`Refusing database target: connected to ${identity.database} as ${identity.username}, expected ${expectedDatabase} as ${expectedUser}.`);
    }
    if (expectedServer && (identity.address !== expectedServer.address || identity.port !== expectedServer.port)) {
      throw new Error("Refusing database target: PostgreSQL server identity differs from validated maintenance connection.");
    }
    return { address: identity.address, port: identity.port };
  } finally {
    await client.end();
  }
}
