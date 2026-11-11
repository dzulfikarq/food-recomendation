import { apiError, isUniqueViolation, parseFoodId, requireUserRequest, validationError } from "@/lib/food/http";
import { hasCurrentConsent, isCollectionOpen, lockResearchStudy } from "@/lib/research/service";
import { parseJsonBody, researchRatingSchema } from "@/lib/research/schemas";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const authorization = await requireUserRequest(request);
  if (!authorization.user) return authorization.response;
  const studyId = parseFoodId(new URL(request.url).searchParams.get("studyId") ?? "");
  if (!studyId) return apiError(400, "INVALID_STUDY_ID", "ID penelitian tidak valid.");
  const userId = Number(authorization.user.id);
  const participant = await prisma.researchParticipant.findUnique({
    where: { studyId_userId: { studyId, userId } },
    include: { study: true, ratings: { select: { foodId: true, rating: true, updatedAt: true, consentVersion: true, source: true }, orderBy: { foodId: "asc" } } }
  });
  if (!participant) return apiError(403, "CONSENT_REQUIRED", "Setujui dokumen penelitian sebelum membuka rating.");
  if (participant.status === "WITHDRAWAL_REQUESTED" || participant.status === "WITHDRAWN") return apiError(409, "PARTICIPATION_WITHDRAWN", "Partisipasi tidak aktif.");
  const consent = await hasCurrentConsent(prisma, participant.id, participant.study.consentVersion);
  if (!consent) return apiError(403, "CONSENT_REQUIRED", "Setujui versi persetujuan terbaru sebelum membuka rating.");

  const currentRatings = participant.ratings.filter((rating) => rating.consentVersion === participant.study.consentVersion && rating.source === "CONSENTED_USER_ACTION");
  const foods = await prisma.food.findMany({ where: { isActive: true }, orderBy: [{ category: "asc" }, { name: "asc" }], select: { id: true, name: true, category: true, description: true, imageUrl: true } });
  return Response.json({ data: {
    study: { id: participant.study.id, title: participant.study.title, status: participant.study.status, closesAt: participant.study.closesAt },
    participant: { id: participant.id, status: participant.status, ratingCount: currentRatings.length },
    foods: foods.map((food) => ({ ...food, rating: currentRatings.find((rating) => rating.foodId === food.id)?.rating ?? null }))
  } }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const authorization = await requireUserRequest(request);
  if (!authorization.user) return authorization.response;
  const parsed = researchRatingSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) return validationError(parsed.error);
  const userId = Number(authorization.user.id);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const study = await lockResearchStudy(tx, parsed.data.studyId);
      if (!study || !isCollectionOpen(study)) return { error: "STUDY_CLOSED" as const };
      const participant = await tx.researchParticipant.findUnique({ where: { studyId_userId: { studyId: study.id, userId } } });
      if (!participant || !(await hasCurrentConsent(tx, participant.id, study.consentVersion))) return { error: "CONSENT_REQUIRED" as const };
      if (participant.status !== "ACTIVE") return { error: "PARTICIPANT_INACTIVE" as const };
      const previousSubmission = await tx.researchRatingChange.findUnique({
        where: { participantId_idempotencyKey: { participantId: participant.id, idempotencyKey: parsed.data.idempotencyKey } }
      });
      if (previousSubmission) {
        if (previousSubmission.consentVersion !== study.consentVersion || previousSubmission.foodId !== parsed.data.foodId || previousSubmission.newRating !== parsed.data.rating) return { error: "IDEMPOTENCY_KEY_REUSED" as const };
        return { rating: { foodId: previousSubmission.foodId, rating: previousSubmission.newRating, updatedAt: previousSubmission.createdAt }, repeated: true };
      }

      // ponytail: one indexed event count per mutation; move to a shared limiter only if traffic warrants it.
      const recentSubmissions = await tx.researchRatingChange.count({ where: { participantId: participant.id, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } } });
      if (recentSubmissions >= 60) return { error: "RATE_LIMITED" as const };

      const food = await tx.food.findFirst({ where: { id: parsed.data.foodId, isActive: true }, select: { id: true } });
      if (!food) return { error: "FOOD_UNAVAILABLE" as const };
      const existing = await tx.researchRating.findUnique({ where: { participantId_foodId: { participantId: participant.id, foodId: food.id } } });
      const old = existing?.consentVersion === study.consentVersion ? existing : null;
      const rating = old
        ? await tx.researchRating.update({ where: { id: old.id }, data: { rating: parsed.data.rating, triedAt: new Date() } })
        : await tx.researchRating.upsert({
          where: { participantId_foodId: { participantId: participant.id, foodId: food.id } },
          create: { participantId: participant.id, foodId: food.id, rating: parsed.data.rating, consentVersion: study.consentVersion, source: "CONSENTED_USER_ACTION" },
          update: { rating: parsed.data.rating, triedAt: new Date(), consentVersion: study.consentVersion, source: "CONSENTED_USER_ACTION" }
        });
      await tx.researchRatingChange.create({
        data: {
          participantId: participant.id,
          foodId: food.id,
          changeType: old ? "UPDATED" : "CREATED",
          oldRating: old?.rating ?? null,
          newRating: parsed.data.rating,
          consentVersion: study.consentVersion,
          source: "CONSENTED_USER_ACTION",
          idempotencyKey: parsed.data.idempotencyKey
        }
      });
      return { rating, repeated: false };
    }, { isolationLevel: "Serializable" });

    if ("error" in result) {
      if (result.error === "STUDY_CLOSED") return apiError(409, result.error, "Periode pengumpulan penelitian tidak aktif.");
      if (result.error === "CONSENT_REQUIRED") return apiError(403, result.error, "Persetujuan versi terbaru diperlukan.");
      if (result.error === "PARTICIPANT_INACTIVE") return apiError(409, result.error, "Sesi partisipasi tidak aktif.");
      if (result.error === "IDEMPOTENCY_KEY_REUSED") return apiError(409, result.error, "Kunci pengiriman telah dipakai untuk rating berbeda.");
      if (result.error === "RATE_LIMITED") return apiError(429, result.error, "Terlalu banyak perubahan rating. Tunggu sebentar sebelum mencoba lagi.");
      return apiError(404, "FOOD_UNAVAILABLE", "Makanan tidak ditemukan atau sudah tidak aktif.");
    }
    return Response.json({ data: { foodId: result.rating.foodId, rating: result.rating.rating, updatedAt: result.rating.updatedAt }, repeated: result.repeated }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isUniqueViolation(error)) return apiError(409, "DUPLICATE_SUBMISSION", "Rating sudah tersimpan. Muat ulang daftar makanan.");
    return apiError(409, "RESEARCH_RATING_SAVE_FAILED", "Rating penelitian belum tersimpan. Coba lagi.");
  }
}
