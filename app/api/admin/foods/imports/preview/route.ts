import { createHash } from "node:crypto";
import path from "node:path";
import { MAX_FOOD_CSV_BYTES, MAX_FOOD_CSV_ROWS } from "@/lib/food/constants";
import { parseFoodCsv } from "@/lib/food/csv";
import { apiError, requireAdminRequest } from "@/lib/food/http";
import { findExistingFoodCodes, recordFailedFoodImport, safeImportFilename, stageFoodImport, toAdminId } from "@/lib/food/import";
import { prisma } from "@/lib/prisma";

const csvMimeTypes = new Set(["text/csv", "application/csv", "application/vnd.ms-excel", "application/octet-stream"]);

export async function POST(request: Request) {
  const authorization = await requireAdminRequest(request);
  if (!authorization.user) return authorization.response;
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_FOOD_CSV_BYTES + 64 * 1024) return apiError(413, "CSV_TOO_LARGE", "Ukuran CSV melebihi batas 2 MB.");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError(400, "INVALID_REQUEST", "Body harus berupa multipart form-data.");
  }

  const value = form.get("file");
  if (!(value instanceof File) || !value.name) return apiError(400, "CSV_REQUIRED", "Pilih file CSV terlebih dahulu.");
  const file = value;
  const buffer = Buffer.from(await file.arrayBuffer());
  const checksum = createHash("sha256").update(buffer).digest("hex");
  const filename = safeImportFilename(file.name);
  const adminId = toAdminId(authorization.user.id);
  const completed = await prisma.foodImport.findFirst({ where: { adminId, fileChecksum: checksum, status: "COMPLETED" }, select: { id: true } });
  if (completed) return apiError(409, "CSV_ALREADY_IMPORTED", "File CSV yang sama sudah pernah berhasil diimport.");

  const extensionValid = path.extname(filename).toLowerCase() === ".csv";
  const mimeValid = csvMimeTypes.has(file.type || "application/octet-stream");

  if (!extensionValid || !mimeValid) {
    await recordFailedFoodImport({ adminId, filename, fileChecksum: checksum, totalRows: 0 });
    return apiError(415, "UNSUPPORTED_CSV_TYPE", "Unggah file .csv berformat UTF-8.");
  }
  if (buffer.length === 0 || buffer.length > MAX_FOOD_CSV_BYTES) {
    await recordFailedFoodImport({ adminId, filename, fileChecksum: checksum, totalRows: 0 });
    return apiError(413, "CSV_TOO_LARGE", "CSV kosong atau melebihi batas ukuran 2 MB.");
  }

  const parsed = parseFoodCsv(buffer);
  const errors = [...parsed.errors];
  if (parsed.totalRows === 0 && errors.length === 0) errors.push({ row: 2, message: "CSV harus memiliki setidaknya satu baris data." });
  if (parsed.totalRows > MAX_FOOD_CSV_ROWS) errors.push({ row: 0, message: `Maksimum ${MAX_FOOD_CSV_ROWS} baris data per import.` });
  if (errors.length === 0) errors.push(...await findExistingFoodCodes(parsed.rows));

  if (errors.length) {
    await recordFailedFoodImport({ adminId, filename, fileChecksum: checksum, totalRows: parsed.totalRows });
    return Response.json({
      error: { code: "CSV_VALIDATION_FAILED", message: "Perbaiki semua kesalahan sebelum import.", details: errors },
      data: { totalRows: parsed.totalRows, validRows: parsed.rows.length }
    }, { status: 422 });
  }

  try {
    const staged = await stageFoodImport({ adminId, filename, fileChecksum: checksum, totalRows: parsed.totalRows, csv: buffer });
    if (staged.import.status === "COMPLETED") {
      return apiError(409, "CSV_ALREADY_IMPORTED", "File CSV yang sama sudah pernah diimport.");
    }
    if (staged.import.status !== "VALIDATED" || !staged.import.stagingKey) {
      return apiError(409, "IMPORT_IN_PROGRESS", "Import file ini sedang diproses.");
    }
    return Response.json({
      data: {
        importId: staged.import.id,
        filename: staged.import.filename,
        status: staged.import.status,
        totalRows: parsed.totalRows,
        validRows: parsed.rows.length,
        reusedDraft: staged.reused,
        preview: parsed.rows.slice(0, 10).map(({ data }) => data)
      },
      message: "Validasi berhasil. Tinjau preview sebelum commit."
    });
  } catch {
    return apiError(500, "CSV_STAGE_FAILED", "CSV tervalidasi tetapi gagal disimpan sebagai draft.");
  }
}
