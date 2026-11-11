import { createHash } from "node:crypto";
import { apiError, parseFoodId, requireAdminRequest } from "@/lib/food/http";
import { readResearchExport } from "@/lib/research/storage";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await requireAdminRequest(request);
  if (!authorization.user) return authorization.response;
  const id = parseFoodId((await params).id);
  if (!id) return apiError(400, "INVALID_EXPORT_ID", "ID ekspor tidak valid.");
  const dataset = await prisma.researchExport.findUnique({ where: { id } });
  if (!dataset) return apiError(404, "EXPORT_NOT_FOUND", "Ekspor penelitian tidak ditemukan.");
  if (dataset.status !== "READY") return apiError(410, "EXPORT_REVOKED_OR_AFFECTED", "Unduhan diblokir karena ekspor ditandai untuk revokasi atau sudah dicabut.");
  try {
    const buffer = await readResearchExport(dataset.filePath);
    if (createHash("sha256").update(buffer).digest("hex") !== dataset.fileChecksum) {
      console.error(JSON.stringify({ event: "research_export_integrity_failed", reason: "checksum_mismatch" }));
      return apiError(500, "EXPORT_CHECKSUM_MISMATCH", "Checksum file ekspor tidak cocok dengan manifest.");
    }
    return new Response(buffer, { headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${dataset.filename}"`,
      "Cache-Control": "private, no-store"
    } });
  } catch (error) {
    console.error(JSON.stringify({ event: "research_export_storage_failed", operation: "read", errorType: error instanceof Error ? error.name : "UnknownError" }));
    return apiError(404, "EXPORT_FILE_MISSING", "File ekspor tidak tersedia pada storage privat.");
  }
}
