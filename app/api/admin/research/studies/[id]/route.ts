import { apiError, parseFoodId, requireAdminRequest, validationError } from "@/lib/food/http";
import { researchStudyUpdateSchema, parseJsonBody } from "@/lib/research/schemas";
import { lockResearchStudy } from "@/lib/research/service";
import { prisma } from "@/lib/prisma";

const materialFields = ["title", "description", "purpose", "dataCollected", "dataUse", "withdrawalInstructions", "consentDocument", "contactName", "contactEmail", "retentionUntil", "retentionPolicy"] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await requireAdminRequest(request);
  if (!authorization.user) return authorization.response;
  const id = parseFoodId((await params).id);
  if (!id) return apiError(400, "INVALID_STUDY_ID", "ID penelitian tidak valid.");
  const parsed = researchStudyUpdateSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) return validationError(parsed.error);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await lockResearchStudy(tx, id);
      if (!existing) return { error: "STUDY_NOT_FOUND" as const };
      if (existing.status === "CLOSED" || existing.status === "ARCHIVED") return { error: "STUDY_IMMUTABLE" as const };
      const update = parsed.data;
      if (existing.status === "OPEN") {
        const changesMaterialTerms = materialFields.some((field) => field in update && update[field] !== existing[field]);
        const newVersion = update.consentVersion ?? existing.consentVersion;
        if (changesMaterialTerms && newVersion === existing.consentVersion) return { error: "CONSENT_VERSION_REQUIRED" as const };
        if (newVersion !== existing.consentVersion && await tx.researchConsent.count({ where: { version: newVersion, participant: { studyId: id } } })) return { error: "CONSENT_VERSION_REUSED" as const };
        if ("startsAt" in update && update.startsAt?.getTime() !== existing.startsAt.getTime()) return { error: "STUDY_START_FROZEN" as const };
      }
      const startsAt = update.startsAt ?? existing.startsAt;
      const closesAt = update.closesAt ?? existing.closesAt;
      const retentionUntil = update.retentionUntil ?? existing.retentionUntil;
      if (startsAt >= closesAt) return { error: "INVALID_STUDY_DATES" as const };
      if (!retentionUntil || retentionUntil <= closesAt) return { error: "INVALID_RETENTION" as const };
      return { study: await tx.researchStudy.update({ where: { id }, data: update }) };
    }, { isolationLevel: "Serializable" });
    if ("error" in result) {
      if (result.error === "STUDY_NOT_FOUND") return apiError(404, result.error, "Penelitian tidak ditemukan.");
      if (result.error === "STUDY_IMMUTABLE") return apiError(409, result.error, "Penelitian tertutup atau diarsipkan tidak dapat diubah.");
      if (result.error === "CONSENT_VERSION_REQUIRED") return apiError(422, result.error, "Perubahan isi atau informasi material memerlukan versi persetujuan baru.");
      if (result.error === "CONSENT_VERSION_REUSED") return apiError(409, result.error, "Versi persetujuan tidak dapat digunakan kembali setelah pernah disetujui partisipan.");
      if (result.error === "STUDY_START_FROZEN") return apiError(409, result.error, "Tanggal mulai tidak dapat diubah setelah penelitian dibuka.");
      if (result.error === "INVALID_STUDY_DATES") return apiError(422, "INVALID_STUDY_DATES", "Tanggal penutupan harus setelah tanggal mulai.");
      return apiError(422, "INVALID_RETENTION", "Batas retensi harus setelah tanggal penutupan.");
    }
    return Response.json({ data: result.study, message: "Pengaturan penelitian diperbarui." }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return apiError(409, "STUDY_UPDATE_FAILED", "Perubahan tidak dapat disimpan. Periksa versi persetujuan dan tanggal penelitian.");
  }
}
