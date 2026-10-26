import { apiError, parseFoodId, requireAdminRequest } from "@/lib/food/http";
import { RecommendationDatasetError, publishRecommendationBatch } from "@/lib/recommendations/service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await requireAdminRequest(request);
  if (!authorization.user) return authorization.response;
  const id = parseFoodId((await params).id);
  const adminId = Number(authorization.user.id);
  if (!id) return apiError(400, "INVALID_BATCH_ID", "ID batch tidak valid.");
  if (!Number.isSafeInteger(adminId) || adminId < 1) return apiError(401, "INVALID_ADMIN", "Akun administrator tidak valid.");

  try {
    const result = await publishRecommendationBatch(id, adminId);
    if (result.status === "NOT_FOUND") return apiError(404, "BATCH_NOT_FOUND", "Batch rekomendasi tidak ditemukan.");
    if (result.status === "ALREADY_PUBLISHED") return apiError(409, "BATCH_ALREADY_PUBLISHED", "Batch ini sudah dipublikasikan.");
    if (result.status === "SUPERSEDED") return apiError(409, "BATCH_SUPERSEDED", "Batch lama tidak dapat dipublikasikan kembali.");
    if (result.status === "INVALID") {
      return Response.json({ error: { code: "BATCH_REVALIDATION_FAILED", message: "Batch tidak lagi memenuhi syarat publikasi.", details: result.report.errors }, data: { report: result.report } }, { status: 409 });
    }
    return Response.json({ data: { id: result.batch.id, status: result.batch.status, publishedAt: result.batch.publishedAt, report: result.report }, message: "Rekomendasi berhasil dipublikasikan." });
  } catch (error) {
    if (error instanceof RecommendationDatasetError) return apiError(409, "BATCH_FILES_UNAVAILABLE", "File batch atau dataset sumber tidak tersedia dan tidak dapat diaudit.");
    return apiError(500, "BATCH_PUBLISH_FAILED", "Batch tidak dapat dipublikasikan.");
  }
}
