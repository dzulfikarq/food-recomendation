import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import type { FoodCsvError, ParsedFoodCsvRow } from "@/lib/food/csv";
import { removeCsvDraft, saveCsvDraft } from "@/lib/food/storage";

export function csvChecksum(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function safeImportFilename(name: string) {
  const filename = [...path.posix.basename(name.replaceAll("\\", "/"))]
    .filter((character) => character.charCodeAt(0) >= 32 && !(character.charCodeAt(0) >= 127 && character.charCodeAt(0) <= 159))
    .join("")
    .trim()
    .slice(0, 255);
  return filename || "food-catalog.csv";
}

export function toAdminId(userId: string) {
  const id = Number(userId);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("Invalid administrator ID.");
  return id;
}

export async function findExistingFoodCodes(rows: ParsedFoodCsvRow[]): Promise<FoodCsvError[]> {
  if (!rows.length) return [];
  const existing = await prisma.food.findMany({
    where: { foodCode: { in: rows.map(({ data }) => data.foodCode) } },
    select: { foodCode: true }
  });
  const codes = new Set(existing.map(({ foodCode }) => foodCode));
  return rows
    .filter(({ data }) => codes.has(data.foodCode))
    .map(({ row, data }) => ({ row, field: "food_code", message: `Kode ${data.foodCode} sudah terdaftar; import hanya menambahkan record baru.` }));
}

export async function recordFailedFoodImport(input: {
  adminId: number;
  filename: string;
  fileChecksum: string;
  totalRows: number;
}) {
  return prisma.foodImport.create({
    data: { ...input, insertedRows: 0, status: "FAILED" }
  });
}

export async function stageFoodImport(input: {
  adminId: number;
  filename: string;
  fileChecksum: string;
  totalRows: number;
  csv: Buffer;
}) {
  const previous = await prisma.foodImport.findFirst({
    where: { adminId: input.adminId, fileChecksum: input.fileChecksum, status: { in: ["VALIDATED", "PROCESSING"] } },
    orderBy: { createdAt: "desc" }
  });
  if (previous) return { import: previous, reused: true };

  const completed = await prisma.foodImport.findFirst({
    where: { adminId: input.adminId, fileChecksum: input.fileChecksum, status: "COMPLETED" },
    orderBy: { createdAt: "desc" }
  });
  if (completed) return { import: completed, reused: false };

  const stagingKey = randomUUID();
  await saveCsvDraft(stagingKey, input.csv);
  try {
    const record = await prisma.foodImport.create({
      data: {
        adminId: input.adminId,
        filename: input.filename,
        fileChecksum: input.fileChecksum,
        totalRows: input.totalRows,
        insertedRows: 0,
        status: "VALIDATED",
        stagingKey
      }
    });
    return { import: record, reused: false };
  } catch (error) {
    await removeCsvDraft(stagingKey).catch(() => undefined);
    throw error;
  }
}
