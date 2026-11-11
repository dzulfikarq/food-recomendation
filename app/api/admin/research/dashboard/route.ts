import { apiError, parseFoodId, requireAdminRequest } from "@/lib/food/http";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const authorization = await requireAdminRequest(request);
  if (!authorization.user) return authorization.response;
  const params = new URL(request.url).searchParams;
  const requestedId = params.has("studyId") ? parseFoodId(params.get("studyId") ?? "") : null;
  if (params.has("studyId") && !requestedId) return apiError(400, "INVALID_STUDY_ID", "ID penelitian tidak valid.");

  const studies = await prisma.researchStudy.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true, title: true, description: true, purpose: true, dataCollected: true, dataUse: true,
      withdrawalInstructions: true, consentVersion: true, consentDocument: true, contactName: true,
      contactEmail: true, status: true, startsAt: true, closesAt: true, retentionUntil: true, retentionPolicy: true, createdAt: true
    }
  });
  const selected = requestedId ? studies.find((study) => study.id === requestedId) : studies.find((study) => study.status === "OPEN") ?? studies[0];
  if (requestedId && !selected) return apiError(404, "STUDY_NOT_FOUND", "Penelitian tidak ditemukan.");
  if (!selected) return Response.json({ data: { studies, selectedStudy: null, statistics: null, exports: [], pendingWithdrawals: [] } }, { headers: { "Cache-Control": "no-store" } });

  const eligibleParticipant = {
    studyId: selected.id,
    status: { in: ["ACTIVE", "COMPLETED"] },
    consents: { some: { version: selected.consentVersion, revokedAt: null } }
  } satisfies Prisma.ResearchParticipantWhereInput;
  const [participantCount, consentedCount, activeCount, completedCount, participants, ratingGroups, foodCount, activeFoodCount, withdrawals, exports] = await Promise.all([
    prisma.researchParticipant.count({ where: { studyId: selected.id } }),
    prisma.researchParticipant.count({ where: { studyId: selected.id, consents: { some: {} } } }),
    prisma.researchParticipant.count({ where: { ...eligibleParticipant, status: "ACTIVE" } }),
    prisma.researchParticipant.count({ where: { ...eligibleParticipant, status: "COMPLETED" } }),
    prisma.researchParticipant.findMany({ where: eligibleParticipant, select: { id: true, _count: { select: { ratings: { where: { consentVersion: selected.consentVersion, source: "CONSENTED_USER_ACTION" } } } } } }),
    prisma.researchRating.groupBy({ by: ["rating"], where: { participant: eligibleParticipant, consentVersion: selected.consentVersion, source: "CONSENTED_USER_ACTION" }, _count: { _all: true } }),
    prisma.food.count(),
    prisma.food.count({ where: { isActive: true } }),
    prisma.researchWithdrawal.findMany({ where: { status: "PENDING", participant: { studyId: selected.id } }, orderBy: { requestedAt: "asc" }, select: { id: true, requestedAt: true, participant: { select: { id: true, study: { select: { title: true } }, _count: { select: { ratings: true } } } } } }),
    prisma.researchExport.findMany({ where: { studyId: selected.id }, orderBy: [{ version: "desc" }], take: 25, select: { id: true, version: true, filename: true, fileChecksum: true, participantCount: true, ratingCount: true, foodCount: true, consentVersion: true, status: true, withdrawalAffectedAt: true, revokedAt: true, createdAt: true, manifest: true } })
  ]);
  const countOfGroup = (count: true | { _all?: number } | undefined) => typeof count === "object" ? count._all ?? 0 : 0;
  const ratingDistribution = [1, 2, 3, 4, 5].map((rating) => ({ rating, count: countOfGroup(ratingGroups.find((group) => group.rating === rating)?._count) }));
  const totalRatings = ratingDistribution.reduce((sum, item) => sum + item.count, 0);
  const contributors = participants.filter((participant) => participant._count.ratings > 0);
  const ratedFoods = await prisma.researchRating.groupBy({ by: ["foodId"], where: { participant: eligibleParticipant, consentVersion: selected.consentVersion, source: "CONSENTED_USER_ACTION" }, _count: { _all: true }, orderBy: { _count: { foodId: "desc" } } });
  const foods = await prisma.food.findMany({ select: { id: true, name: true, isActive: true }, orderBy: { id: "asc" } });
  const foodRatingCounts = new Map(ratedFoods.map((item) => [item.foodId, countOfGroup(item._count)]));
  const density = participants.length && foodCount ? (totalRatings / (participants.length * foodCount)) * 100 : 0;

  return Response.json({
    data: {
      studies,
      selectedStudy: selected,
      statistics: {
        registeredParticipants: participantCount,
        consentedParticipants: consentedCount,
        activeParticipants: activeCount,
        completedParticipants: completedCount,
        participantsWithRatings: contributors.length,
        ratings: totalRatings,
        foodsRated: ratedFoods.length,
        foodCatalogSize: foodCount,
        activeFoods: activeFoodCount,
        averageRatingsPerContributingParticipant: contributors.length ? Number((totalRatings / contributors.length).toFixed(2)) : 0,
        participantsWithAtMostOneRating: participants.filter((participant) => participant._count.ratings <= 1).length,
        matrixDensityPercent: Number(density.toFixed(2)),
        ratingDistribution,
        ratingsPerFood: foods.map((food) => ({ foodId: food.id, foodName: food.name, active: food.isActive, count: foodRatingCounts.get(food.id) ?? 0 })),
        sparsityNotice: `Kepadatan matriks ${density.toFixed(2)}%. Ini deskripsi cakupan, bukan ambang kecukupan ilmiah; protokol evaluasi dan ambang belum disetujui.`
      },
      pendingWithdrawals: withdrawals.map((withdrawal) => ({ id: withdrawal.id, requestedAt: withdrawal.requestedAt, participantId: withdrawal.participant.id, studyTitle: withdrawal.participant.study.title, ratingsPendingDeletion: withdrawal.participant._count.ratings })),
      exports
    }
  }, { headers: { "Cache-Control": "no-store" } });
}
