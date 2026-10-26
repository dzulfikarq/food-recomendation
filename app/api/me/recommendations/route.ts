import { apiError, requireUserRequest } from "@/lib/food/http";
import { getUserRecommendations } from "@/lib/recommendations/service";

export async function GET(request: Request) {
  const authorization = await requireUserRequest(request);
  if (!authorization.user) return authorization.response;
  const userId = Number(authorization.user.id);
  if (!Number.isSafeInteger(userId) || userId < 1) return apiError(401, "INVALID_USER", "Akun pengguna tidak valid.");
  try {
    return Response.json({ data: await getUserRecommendations(userId) });
  } catch {
    return apiError(500, "RECOMMENDATIONS_READ_FAILED", "Rekomendasi tidak dapat dimuat.");
  }
}
