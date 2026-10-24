import { createHash } from "node:crypto";
import { isUniqueViolation, apiError, parseFoodId, requireAdminRequest } from "@/lib/food/http";
import { parseFoodCsv } from "@/lib/food/csv";
import { readCsvDraft, removeCsvDraft } from "@/lib/food/storage";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const authorization = await requireAdminRequest(request);
  if (!authorization.user) return authorization.response;
  const id = parseFoodId((await params).id);
  const adminId = Number(authorization.user.id);
  if (!id) return apiError(400, "INVALID_IMPORT_ID", "ID import tidak valid.");
  if (!Number.isSafeInteger(adminId) || adminId < 1) return apiError(401, "INVALID_ADMIN", "Akun administrator tidak valid.");

  const record = await prisma.foodImport.findFirst({ where: { id, adminId } });
  if (!record) return apiError(404, "IMPORT_NOT_FOUND", "Draft import tidak ditemukan.");
  if (record.status === "COMPLETED") return apiError(409, "IMPORT_ALREADY_COMMITTED", "Import ini sudah berhasil dijalankan.");
  if (record.status !== "VALIDATED" || !record.stagingKey) return apiError(409, "IMPORT_NOT_READY", "Hanya draft tervalidasi yang dapat di-commit.");

  let buffer: Buffer;
  try {
    buffer = await readCsvDraft(record.stagingKey);
  } catch {
    await prisma.foodImport.updateMany({ where: { id, adminId, status: "VALIDATED" }, data: { status: "FAILED", stagingKey: null } });
    return apiError(410, "IMPORT_DRAFT_EXPIRED", "File draft tidak tersedia lagi. Unggah ulang CSV.");
  }
  const checksum = createHash("sha256").update(buffer).digest("hex");
  if (checksum !== record.fileChecksum) {
    const failed = await prisma.foodImport.updateMany({ where: { id, adminId, status: "VALIDATED" }, data: { status: "FAILED", stagingKey: null } });
    if (failed.count) await removeCsvDraft(record.stagingKey).catch(() => undefined);
    return apiError(409, "IMPORT_CHECKSUM_MISMATCH", "File draft berubah setelah preview.");
  }

  const parsed = parseFoodCsv(buffer);
  if (parsed.errors.length || parsed.totalRows !== record.totalRows || parsed.rows.length !== record.totalRows) {
    const failed = await prisma.foodImport.updateMany({ where: { id, adminId, status: "VALIDATED" }, data: { status: "FAILED", stagingKey: null } });
    if (failed.count) await removeCsvDraft(record.stagingKey).catch(() => undefined);
    return Response.json({
      error: { code: "CSV_NO_LONGER_VALID", message: "Draft CSV tidak lagi valid. Tinjau dan unggah ulang CSV.", details: parsed.errors },
      data: { totalRows: parsed.totalRows, validRows: parsed.rows.length }
    }, { status: 409 });
  }

  try {
    const committed = await prisma.$transaction(async (tx) => {
      const claimed = await tx.foodImport.updateMany({
        where: { id, adminId, status: "VALIDATED", stagingKey: record.stagingKey },
        data: { status: "PROCESSING" }
      });
      if (claimed.count !== 1) throw new Error("IMPORT_STATE_CONFLICT");

      const existingCodes = await tx.food.findMany({
        where: { foodCode: { in: parsed.rows.map(({ data }) => data.foodCode) } },
        select: { foodCode: true }
      });
      if (existingCodes.length) throw new Error("DUPLICATE_FOOD_CODE");

      const inserted = await tx.food.createMany({ data: parsed.rows.map(({ data }) => ({ ...data, isActive: true })) });
      const finished = await tx.foodImport.update({
        where: { id },
        data: { status: "COMPLETED", insertedRows: inserted.count, stagingKey: null }
      });
      return finished;
    });

    await removeCsvDraft(record.stagingKey).catch(() => console.error("Food CSV draft cleanup failed."));
    return Response.json({
      data: { id: committed.id, status: committed.status, totalRows: committed.totalRows, insertedRows: committed.insertedRows },
      message: `${committed.insertedRows} makanan berhasil ditambahkan.`
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const failed = await prisma.foodImport.updateMany({ where: { id, adminId, status: "VALIDATED" }, data: { status: "FAILED", stagingKey: null } });
      if (failed.count) await removeCsvDraft(record.stagingKey).catch(() => undefined);
      return apiError(409, "DUPLICATE_FOOD_CODE", "Kode makanan berubah atau sudah digunakan. Tidak ada baris yang diimport.");
    }
    if (error instanceof Error && error.message === "DUPLICATE_FOOD_CODE") {
      const failed = await prisma.foodImport.updateMany({ where: { id, adminId, status: "VALIDATED" }, data: { status: "FAILED", stagingKey: null } });
      if (failed.count) await removeCsvDraft(record.stagingKey).catch(() => undefined);
      return apiError(409, "DUPLICATE_FOOD_CODE", "Kode makanan sudah digunakan. Tidak ada baris yang diimport.");
    }
    if (error instanceof Error && error.message === "IMPORT_STATE_CONFLICT") {
      return apiError(409, "IMPORT_ALREADY_COMMITTED", "Draft ini sudah diproses oleh request lain.");
    }
    return apiError(500, "FOOD_IMPORT_FAILED", "Import gagal. Tidak ada baris yang tersimpan; draft dapat dicoba kembali.");
  }
}
