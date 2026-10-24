import { apiError, parseFoodId, requireUserRequest, validationError } from "@/lib/food/http";
import { ratingInputSchema } from "@/lib/food/schemas";
import { prisma } from "@/lib/prisma";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await requireUserRequest(request);
  if (!authorization.user) return authorization.response;
  const foodId = parseFoodId((await params).id);
  const userId = Number(authorization.user.id);
  if (!foodId) return apiError(400, "INVALID_FOOD_ID", "ID makanan tidak valid.");
  if (!Number.isSafeInteger(userId) || userId < 1) return apiError(401, "INVALID_USER", "Akun pengguna tidak valid.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_REQUEST", "Body request tidak valid.");
  }
  const parsed = ratingInputSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const foods = await tx.$queryRaw<Array<{ id: number; isActive: boolean }>>`SELECT "id", "isActive" FROM "Food" WHERE "id" = ${foodId} FOR UPDATE`;
      const food = foods[0];
      if (!food) return { status: "NOT_FOUND" as const };
      if (!food.isActive) return { status: "INACTIVE" as const };

      const rating = await tx.rating.upsert({
        where: { userId_foodId: { userId, foodId } },
        update: { rating: parsed.data.rating },
        create: { userId, foodId, rating: parsed.data.rating }
      });
      await tx.food.updateMany({ where: { id: foodId, firstUsedAt: null }, data: { firstUsedAt: new Date() } });
      return { status: "SAVED" as const, rating };
    });

    if (result.status === "NOT_FOUND") return apiError(404, "FOOD_NOT_FOUND", "Makanan tidak ditemukan.");
    if (result.status === "INACTIVE") return apiError(409, "FOOD_INACTIVE", "Makanan nonaktif tidak dapat dinilai.");
    return Response.json({ data: { foodId, rating: result.rating.rating, createdAt: result.rating.createdAt, updatedAt: result.rating.updatedAt }, message: "Rating tersimpan." });
  } catch {
    return apiError(500, "RATING_SAVE_FAILED", "Rating tidak dapat disimpan.");
  }
}
