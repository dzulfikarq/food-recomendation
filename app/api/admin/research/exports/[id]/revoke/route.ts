import { z } from "zod";
import { apiError, parseFoodId, requireAdminRequest, validationError } from "@/lib/food/http";
import { lockResearchStudy } from "@/lib/research/service";
import { parseJsonBody } from "@/lib/research/schemas";
import { removeResearchExport } from "@/lib/research/storage";
import { prisma } from "@/lib/prisma";

const revocationSchema = z.object({ note: z.string().trim().min(10).max(2_000), externalRecipientsNotified: z.literal(true) }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await requireAdminRequest(request);
  if (!authorization.user) return authorization.response;
  const exportId = parseFoodId((await params).id);
  const adminId = Number(authorization.user.id);
  if (!exportId) return apiError(400, "INVALID_EXPORT_ID", "ID ekspor tidak valid.");
  if (!Number.isSafeInteger(adminId) || adminId < 1) return apiError(401, "INVALID_ADMIN", "Akun administrator tidak valid.");
  const parsed = revocationSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) return validationError(parsed.error);
  const dataset = await prisma.researchExport.findUnique({ where: { id: exportId } });
  if (!dataset) return apiError(404, "EXPORT_NOT_FOUND", "Ekspor penelitian tidak ditemukan.");
  if (dataset.status === "REVOKED") return Response.json({ data: { status: dataset.status, repeated: true } }, { headers: { "Cache-Control": "no-store" } });
  if (dataset.status !== "REVOCATION_REQUIRED") return apiError(409, "EXPORT_NOT_AFFECTED", "Ekspor ini belum ditandai terdampak withdrawal.");

  try {
    await removeResearchExport(dataset.filePath);
    const result = await prisma.$transaction(async (tx) => {
      await lockResearchStudy(tx, dataset.studyId);
      const current = await tx.researchExport.findUnique({ where: { id: exportId } });
      if (!current) return { error: "EXPORT_NOT_FOUND" as const };
      if (current.status === "REVOKED") return { status: current.status, repeated: true };
      if (current.status !== "REVOCATION_REQUIRED") return { error: "EXPORT_NOT_AFFECTED" as const };
      const revokedAt = new Date();
      await tx.researchExport.update({ where: { id: exportId }, data: { status: "REVOKED", revokedAt } });
      await tx.researchExportRevocation.create({ data: {
        exportId,
        adminId,
        note: parsed.data.note,
        externalRecipientsNotified: parsed.data.externalRecipientsNotified,
        fileDeleted: true,
        revokedAt
      } });
      return { status: "REVOKED" as const, repeated: false };
    }, { isolationLevel: "Serializable" });
    if ("error" in result) return apiError(result.error === "EXPORT_NOT_FOUND" ? 404 : 409, result.error === "EXPORT_NOT_FOUND" ? result.error : "EXPORT_NOT_AFFECTED", "Status ekspor berubah; periksa dashboard dan ulangi bila perlu.");
    return Response.json({ data: result, message: "Revokasi tercatat; unduhan diblokir dan file privat server dihapus." }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return apiError(409, "EXPORT_REVOCATION_FAILED", "Revokasi belum selesai. Ekspor tetap diblokir; coba proses lagi.");
  }
}
