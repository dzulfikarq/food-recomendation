import "dotenv/config";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "@/lib/prisma";
import { readApplicationEnvironment } from "@/lib/env";
import { assertSeedTarget } from "@/prisma/assert-seed-target";

async function main() {
  assertSeedTarget();
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = readApplicationEnvironment();
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD in .env before provisioning the administrator.");
  }

  const email = ADMIN_EMAIL.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.role !== "ADMIN") throw new Error("That email belongs to a USER. Seed will not promote existing accounts.");
    console.info("Administrator already exists; no changes made.");
    return;
  }

  const password = await hashPassword(ADMIN_PASSWORD);
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name: "FoodRec Administrator", email, emailVerified: true, role: "ADMIN" }
    });
    await tx.account.create({
      data: { accountId: String(user.id), providerId: "credential", userId: user.id, password }
    });
  });

  console.info(`Provisioned administrator ${email}.`);
}

main()
  .catch((error: unknown) => {
    console.error("Admin provisioning failed:", error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
