import { apiError, parseFoodId, requireAdminRequest } from "@/lib/food/http";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await requireAdminRequest(request);
  if (!authorization.user) return authorization.response;
  const id = parseFoodId((await params).id);
  if (!id) return apiError(400, "INVALID_EXPORT_ID", "ID ekspor tidak valid.");
  const dataset = await prisma.researchExport.findUnique({ where: { id }, select: { filename: true, fileChecksum: true, manifest: true, status: true, withdrawalAffectedAt: true, revokedAt: true } });
  if (!dataset) return apiError(404, "EXPORT_NOT_FOUND", "Ekspor penelitian tidak ditemukan.");
  return Response.json({ data: { ...dataset.manifest as object, filename: dataset.filename, status: dataset.status, withdrawalAffectedAt: dataset.withdrawalAffectedAt, revokedAt: dataset.revokedAt } }, { headers: { "Cache-Control": "private, no-store" } });
}
