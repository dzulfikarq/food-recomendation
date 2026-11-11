import { apiError, requireUserRequest, validationError } from "@/lib/food/http";
import { lockResearchStudy } from "@/lib/research/service";
import { parseJsonBody, researchStudyIdSchema } from "@/lib/research/schemas";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const authorization = await requireUserRequest(request);
  if (!authorization.user) return authorization.response;
  const parsed = researchStudyIdSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) return validationError(parsed.error);
  const userId = Number(authorization.user.id);
  const result = await prisma.$transaction(async (tx) => {
    const study = await lockResearchStudy(tx, parsed.data.studyId);
    if (!study) return { error: "STUDY_NOT_FOUND" as const };
    const participant = await tx.researchParticipant.findUnique({ where: { studyId_userId: { studyId: study.id, userId } } });
    if (!participant) return { error: "PARTICIPANT_NOT_FOUND" as const };
    if (participant.status === "WITHDRAWN" || participant.status === "WITHDRAWAL_REQUESTED") {
      const withdrawal = await tx.researchWithdrawal.findUnique({ where: { participantId: participant.id } });
      return { requestedAt: withdrawal?.requestedAt ?? participant.withdrawalRequestedAt, repeated: true };
    }

    const now = new Date();
    await tx.researchParticipant.update({ where: { id: participant.id }, data: { status: "WITHDRAWAL_REQUESTED", withdrawalRequestedAt: now } });
    await tx.researchConsent.updateMany({ where: { participantId: participant.id, revokedAt: null }, data: { revokedAt: now } });
    const withdrawal = await tx.researchWithdrawal.create({ data: { participantId: participant.id } });
    const affected = await tx.researchExport.updateMany({
      where: { status: "READY", participantMemberships: { some: { participantId: participant.id } } },
      data: { status: "REVOCATION_REQUIRED", withdrawalAffectedAt: now }
    });
    return { requestedAt: withdrawal.requestedAt, repeated: false, affectedExportCount: affected.count };
  }, { isolationLevel: "Serializable" });

  if ("error" in result) {
    if (result.error === "STUDY_NOT_FOUND") return apiError(404, result.error, "Penelitian tidak ditemukan.");
    return apiError(404, "PARTICIPANT_NOT_FOUND", "Partisipasi penelitian tidak ditemukan.");
  }
  return Response.json({ data: result, message: "Permintaan penarikan tercatat. Rating dikecualikan dari ekspor baru; admin akan menindaklanjuti salinan lama." }, { headers: { "Cache-Control": "no-store" } });
}
