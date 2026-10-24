import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { initialFoodCatalog } from "@/prisma/food-catalog";

async function main() {
  const result = await prisma.food.createMany({ data: initialFoodCatalog, skipDuplicates: true });
  console.info(`Food catalog seed complete: ${result.count} new food records; existing Food Codes were left unchanged.`);
}

main()
  .catch((error: unknown) => {
    console.error("Food catalog seed failed:", error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
