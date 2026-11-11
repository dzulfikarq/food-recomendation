import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { importFoodComCatalog } from "@/lib/food/foodcom-import";

async function main() {
  const exportDir = process.argv[2];
  if (!exportDir || process.argv[3] !== "--apply" || process.argv.length !== 4) {
    throw new Error("Usage: npm run foodcom:import -- <verified-export-dir> --apply");
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || process.env.NODE_ENV === "production") {
    throw new Error("Food.com import requires an explicit non-production DATABASE_URL ending in _test.");
  }
  const target = new URL(databaseUrl);
  const databaseName = decodeURIComponent(target.pathname.replace(/^\//, ""));
  if (target.protocol !== "postgresql:" || !/^[a-zA-Z0-9_]{1,63}$/.test(databaseName) || !databaseName.endsWith("_test") || !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)) {
    throw new Error(`Refusing Food.com import into ${databaseName || "unknown database"}; target must end in _test.`);
  }
  const result = await importFoodComCatalog(exportDir);
  console.info(`Food.com import ${result.importId} active: ${result.users} historical users, ${result.recipes} recipes, ${result.ratings} training ratings.`);
}

main()
  .catch((error: unknown) => {
    console.error("Food.com import failed:", error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
