import { apiError, requireUserRequest, validationError } from "@/lib/food/http";
import { hasCurrentConsent, lockResearchStudy } from "@/lib/research/service";
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
    if (!participant || !(await hasCurrentConsent(tx, participant.id, study.consentVersion))) return { error: "CONSENT_REQUIRED" as const };
    if (participant.status === "WITHDRAWAL_REQUESTED" || participant.status === "WITHDRAWN") return { error: "PARTICIPATION_WITHDRAWN" as const };
    if (participant.status === "COMPLETED") return { participant, repeated: true };
    const completed = await tx.researchParticipant.update({ where: { id: participant.id }, data: { status: "COMPLETED", completedAt: new Date() } });
    return { participant: completed, repeated: false };
  }, { isolationLevel: "Serializable" });

  if ("error" in result) {
    if (result.error === "STUDY_NOT_FOUND") return apiError(404, result.error, "Penelitian tidak ditemukan.");
    if (result.error === "PARTICIPATION_WITHDRAWN") return apiError(409, result.error, "Partisipasi sedang atau telah ditarik.");
    return apiError(403, "CONSENT_REQUIRED", "Persetujuan aktif diperlukan.");
  }
  return Response.json({ data: { status: result.participant.status, completedAt: result.participant.completedAt }, repeated: result.repeated }, { headers: { "Cache-Control": "no-store" } });
}
