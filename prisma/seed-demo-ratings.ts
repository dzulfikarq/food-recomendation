import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { readDatabaseUrl } from "@/lib/env";

const users = Array.from({ length: 20 }, (_, index) => {
  const number = String(index + 1).padStart(2, "0");
  return { name: `Demo FoodRec User ${number}`, email: `foodrec.demo.user${number}@example.test` };
});

async function main() {
  const url = new URL(readDatabaseUrl());
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && /^foodrec(?:_test)?$/.test(database))) {
    throw new Error("Demo ratings seed only runs against local `foodrec` or `foodrec_test` databases.");
  }

  const result = await prisma.$transaction(async (tx) => {
    const foods = await tx.food.findMany({ select: { id: true } });
    if (!foods.length) throw new Error("No Food records found; seed the catalog before demo ratings.");

    const existingUsers = await tx.user.count({ where: { email: { in: users.map(({ email }) => email) } } });
    const demoUsers = [];
    for (const demo of users) {
      const user = await tx.user.upsert({
        where: { email: demo.email },
        update: {},
        create: { ...demo, role: "USER", emailVerified: true }
      });
      if (user.role !== "USER") throw new Error(`Reserved demo account ${demo.email} must have USER role.`);
      demoUsers.push(user);
    }

    // Deterministic synthetic ratings only; this creates no recommendation output or score.
    const ratings = demoUsers.flatMap((user, userIndex) => foods.map((food, foodIndex) => ({
      userId: user.id,
      foodId: food.id,
      rating: ((userIndex * 7 + foodIndex * 3) % 5) + 1
    })));
    const inserted = await tx.rating.createMany({ data: ratings, skipDuplicates: true });
    await tx.food.updateMany({ where: { id: { in: foods.map(({ id }) => id) }, firstUsedAt: null }, data: { firstUsedAt: new Date() } });

    const coverage = await tx.rating.count({ where: { userId: { in: demoUsers.map(({ id }) => id) }, foodId: { in: foods.map(({ id }) => id) } } });
    if (coverage !== ratings.length) throw new Error(`Expected ${ratings.length} demo ratings; found ${coverage}.`);
    return { usersCreated: users.length - existingUsers, foodCount: foods.length, ratingsCreated: inserted.count, totalRatings: coverage };
  });

  console.log(`Demo seed complete: ${result.usersCreated} new users, ${result.ratingsCreated} new ratings; 20 users × ${result.foodCount} foods = ${result.totalRatings} ratings. Existing ratings unchanged; no login accounts created.`);
}

main()
  .catch((error: unknown) => {
    console.error("Demo ratings seed failed:", error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
