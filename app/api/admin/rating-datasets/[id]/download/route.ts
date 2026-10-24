import { createHash } from "node:crypto";
import { apiError, parseFoodId, requireAdminRequest } from "@/lib/food/http";
import { readRatingExport } from "@/lib/food/storage";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await requireAdminRequest(request);
  if (!authorization.user) return authorization.response;
  const id = parseFoodId((await params).id);
  if (!id) return apiError(400, "INVALID_EXPORT_ID", "ID export tidak valid.");
  const datasetExport = await prisma.datasetExport.findUnique({ where: { id } });
  if (!datasetExport) return apiError(404, "DATASET_EXPORT_NOT_FOUND", "Snapshot dataset tidak ditemukan.");

  try {
    const buffer = await readRatingExport(datasetExport.filePath);
    const checksum = createHash("sha256").update(buffer).digest("hex");
    if (checksum !== datasetExport.fileChecksum) return apiError(500, "DATASET_CHECKSUM_MISMATCH", "File snapshot tidak lolos pemeriksaan integritas.");
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Length": String(buffer.byteLength),
        "Content-Disposition": `attachment; filename="${datasetExport.filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return apiError(500, "DATASET_FILE_UNAVAILABLE", "File snapshot tidak tersedia pada storage privat.");
  }
}
