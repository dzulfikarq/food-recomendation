import { apiError, requireUserRequest, validationError } from "@/lib/food/http";
import { myRatingsQuerySchema } from "@/lib/food/schemas";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const authorization = await requireUserRequest(request);
  if (!authorization.user) return authorization.response;
  const userId = Number(authorization.user.id);
  if (!Number.isSafeInteger(userId) || userId < 1) return apiError(401, "INVALID_USER", "Akun pengguna tidak valid.");
  const query = myRatingsQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return validationError(query.error);

  try {
    const where = { userId };
    const [ratings, total] = await Promise.all([
      prisma.rating.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (query.data.page - 1) * query.data.pageSize,
        take: query.data.pageSize,
        select: {
          id: true, rating: true, createdAt: true, updatedAt: true,
          food: { select: { id: true, foodCode: true, name: true, category: true, imageUrl: true, isActive: true } }
        }
      }),
      prisma.rating.count({ where })
    ]);
    return Response.json({ data: { ratings, pagination: { ...query.data, total, totalPages: Math.max(1, Math.ceil(total / query.data.pageSize)) } } });
  } catch {
    return apiError(500, "RATING_HISTORY_UNAVAILABLE", "Riwayat rating tidak dapat dimuat.");
  }
}
