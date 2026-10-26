import path from "node:path";
import { z } from "zod";
import { apiError, requireAdminRequest } from "@/lib/food/http";
import { MAX_RECOMMENDATION_CSV_BYTES, MAX_RECOMMENDATION_K, MAX_RECOMMENDATION_TOP_N } from "@/lib/recommendations/constants";
import { importRecommendationCsv, RecommendationDatasetError, safeRecommendationFilename } from "@/lib/recommendations/service";

const csvMimeTypes = new Set(["text/csv", "application/csv", "application/vnd.ms-excel", "application/octet-stream"]);
const positiveIntegerText = z.string().regex(/^[1-9]\d*$/, "Harus berupa integer positif.").transform(Number).refine(Number.isSafeInteger, "Integer terlalu besar.");
const formSchema = z.object({
  datasetExportId: positiveIntegerText,
  kNeighbors: positiveIntegerText.pipe(z.number().max(MAX_RECOMMENDATION_K, `Maksimum k=${MAX_RECOMMENDATION_K}.`)),
  topN: positiveIntegerText.pipe(z.number().max(MAX_RECOMMENDATION_TOP_N, `Maksimum Top-N=${MAX_RECOMMENDATION_TOP_N}.`))
});

export async function POST(request: Request) {
  const authorization = await requireAdminRequest(request);
  if (!authorization.user) return authorization.response;
  const contentLengthHeader = request.headers.get("content-length");
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : 0;
  if (contentLengthHeader && (!Number.isSafeInteger(contentLength) || contentLength < 0)) return apiError(400, "INVALID_CONTENT_LENGTH", "Ukuran request tidak valid.");
  if (contentLength > MAX_RECOMMENDATION_CSV_BYTES + 64 * 1024) return apiError(413, "CSV_TOO_LARGE", "Ukuran CSV melebihi batas 2 MB.");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError(400, "INVALID_REQUEST", "Body harus berupa multipart form-data.");
  }
  const fields = formSchema.safeParse({ datasetExportId: form.get("datasetExportId"), kNeighbors: form.get("kNeighbors"), topN: form.get("topN") });
  if (!fields.success) return Response.json({ error: { code: "INVALID_PARAMETERS", message: "Pilih dataset dan parameter pemrosesan yang valid.", details: fields.error.issues.map(({ path: field, message }) => ({ field: field.join("."), message })) } }, { status: 422 });
  const value = form.get("file");
  if (!(value instanceof File) || !value.name) return apiError(400, "CSV_REQUIRED", "Pilih recommendations.csv terlebih dahulu.");
  const file = value;
  const filename = safeRecommendationFilename(file.name);
  if (path.posix.extname(filename).toLowerCase() !== ".csv" || !csvMimeTypes.has(file.type || "application/octet-stream")) {
    return apiError(415, "UNSUPPORTED_CSV_TYPE", "Unggah file .csv berformat UTF-8.");
  }
  if (file.size === 0 || file.size > MAX_RECOMMENDATION_CSV_BYTES) return apiError(413, "CSV_TOO_LARGE", "CSV kosong atau melebihi batas ukuran 2 MB.");
  const adminId = Number(authorization.user.id);
  if (!Number.isSafeInteger(adminId) || adminId < 1) return apiError(401, "INVALID_ADMIN", "Akun administrator tidak valid.");

  try {
    const result = await importRecommendationCsv({ ...fields.data, adminId, filename, buffer: Buffer.from(await file.arrayBuffer()) });
    const data = { batchId: result.batch.id, status: result.batch.status, fileChecksum: result.batch.fileChecksum, report: result.report };
    if (result.report.errors.length) {
      return Response.json({ error: { code: "RECOMMENDATION_VALIDATION_FAILED", message: "Perbaiki semua kesalahan sebelum publikasi.", details: result.report.errors }, data }, { status: 422 });
    }
    return Response.json({ data, message: "Validasi berhasil. Batch tersimpan dan belum dipublikasikan." }, { status: 201 });
  } catch (error) {
    if (error instanceof RecommendationDatasetError) {
      if (error.message === "DATASET_NOT_FOUND") return apiError(404, "DATASET_NOT_FOUND", "Dataset sumber tidak ditemukan.");
      return apiError(409, "DATASET_UNAVAILABLE", "Dataset sumber tidak tersedia atau checksum/formatnya tidak valid.");
    }
    return apiError(500, "RECOMMENDATION_IMPORT_FAILED", "CSV rekomendasi tidak dapat diproses.");
  }
}
