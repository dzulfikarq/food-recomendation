import { apiError, requireUserRequest, validationError } from "@/lib/food/http";
import { hasCurrentConsent, isCollectionOpen, lockResearchStudy } from "@/lib/research/service";
import { parseJsonBody, researchConsentSchema } from "@/lib/research/schemas";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const authorization = await requireUserRequest(request);
  if (!authorization.user) return authorization.response;
  const parsed = researchConsentSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) return validationError(parsed.error);
  const userId = Number(authorization.user.id);
  if (!Number.isSafeInteger(userId) || userId < 1) return apiError(401, "INVALID_USER", "Akun pengguna tidak valid.");

  try {
    const result = await prisma.$transaction(async (tx) => {
      const study = await lockResearchStudy(tx, parsed.data.studyId);
      if (!study || !isCollectionOpen(study)) return { error: "STUDY_CLOSED" as const };
      if (parsed.data.version !== study.consentVersion) return { error: "CONSENT_VERSION_CHANGED" as const };

      let participant = await tx.researchParticipant.findUnique({ where: { studyId_userId: { studyId: study.id, userId } } });
      if (participant?.status === "WITHDRAWAL_REQUESTED" || participant?.status === "WITHDRAWN") return { error: "WITHDRAWN" as const };
      if (!participant) {
        participant = await tx.researchParticipant.create({ data: { studyId: study.id, userId } });
      }

      const existing = await hasCurrentConsent(tx, participant.id, study.consentVersion);
      if (existing) return { participantId: participant.id, acceptedAt: existing.acceptedAt, status: participant.status };

      const alreadyRecorded = await tx.researchConsent.findUnique({ where: { participantId_version: { participantId: participant.id, version: study.consentVersion } } });
      if (alreadyRecorded) return { error: "CONSENT_REVOKED" as const };
      const consent = await tx.researchConsent.create({
        data: { participantId: participant.id, version: study.consentVersion, documentText: study.consentDocument }
      });
      if (participant.status === "COMPLETED") {
        participant = await tx.researchParticipant.update({ where: { id: participant.id }, data: { status: "ACTIVE", completedAt: null } });
      }
      return { participantId: participant.id, acceptedAt: consent.acceptedAt, status: participant.status };
    }, { isolationLevel: "Serializable" });

    if ("error" in result) {
      if (result.error === "STUDY_CLOSED") return apiError(409, result.error, "Pengumpulan untuk penelitian ini tidak sedang dibuka.");
      if (result.error === "CONSENT_VERSION_CHANGED") return apiError(409, result.error, "Versi persetujuan berubah. Tinjau dan setujui dokumen terbaru.");
      if (result.error === "WITHDRAWN") return apiError(409, result.error, "Partisipasi yang sudah ditarik tidak dapat diaktifkan kembali.");
      return apiError(409, "CONSENT_REVOKED", "Persetujuan untuk versi ini sudah dicabut.");
    }
    return Response.json({ data: result, message: "Persetujuan tersimpan." }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return apiError(409, "CONSENT_SAVE_FAILED", "Persetujuan tidak tersimpan. Muat ulang halaman dan coba lagi.");
  }
}
