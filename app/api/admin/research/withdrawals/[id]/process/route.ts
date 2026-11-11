import { apiError, parseFoodId, requireAdminRequest } from "@/lib/food/http";
import { lockResearchStudy } from "@/lib/research/service";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await requireAdminRequest(request);
  if (!authorization.user) return authorization.response;
  const withdrawalId = parseFoodId((await params).id);
  const adminId = Number(authorization.user.id);
  if (!withdrawalId) return apiError(400, "INVALID_WITHDRAWAL_ID", "ID permintaan penarikan tidak valid.");
  if (!Number.isSafeInteger(adminId) || adminId < 1) return apiError(401, "INVALID_ADMIN", "Akun administrator tidak valid.");

  const result = await prisma.$transaction(async (tx) => {
    const found = await tx.researchWithdrawal.findUnique({ where: { id: withdrawalId }, select: { participantId: true, participant: { select: { studyId: true } } } });
    if (!found) return { error: "WITHDRAWAL_NOT_FOUND" as const };
    await lockResearchStudy(tx, found.participant.studyId);
    const withdrawal = await tx.researchWithdrawal.findUnique({ where: { id: withdrawalId } });
    if (!withdrawal) return { error: "WITHDRAWAL_NOT_FOUND" as const };
    if (withdrawal.status === "PROCESSED") return { completed: true, repeated: true };

    await tx.researchRatingChange.deleteMany({ where: { participantId: withdrawal.participantId } });
    await tx.researchRating.deleteMany({ where: { participantId: withdrawal.participantId } });
    await tx.researchParticipant.update({ where: { id: withdrawal.participantId }, data: { status: "WITHDRAWN", withdrawnAt: new Date() } });
    await tx.researchWithdrawal.update({ where: { id: withdrawalId }, data: { status: "PROCESSED", processedAt: new Date(), processedByAdminId: adminId } });
    return { completed: true, repeated: false };
  }, { isolationLevel: "Serializable" });

  if ("error" in result) return apiError(404, "WITHDRAWAL_NOT_FOUND", "Permintaan penarikan tidak ditemukan.");
  return Response.json({ data: result, message: result.repeated ? "Penarikan sebelumnya sudah diproses." : "Rating dan riwayat nilai dihapus; bukti persetujuan, status penarikan, dan keterkaitan ekspor terdampak dipertahankan." }, { headers: { "Cache-Control": "no-store" } });
}
