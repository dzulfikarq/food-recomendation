import "dotenv/config";
import { defineConfig } from "prisma/config";
import { readDatabaseUrl } from "./lib/env";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: { url: readDatabaseUrl() }
});
