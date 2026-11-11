import { apiError, requireAdminRequest } from "@/lib/food/http";
import { EmptyRatingDatasetError, RatingDatasetTooLargeError, createRatingDatasetExport } from "@/lib/food/rating-export";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const authorization = await requireAdminRequest(request);
  if (!authorization.user) return authorization.response;
  const [exports, accountRatingCount, historicalRatingCount] = await Promise.all([
    prisma.datasetExport.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, filename: true, fileChecksum: true, rowCount: true, createdAt: true }
    }),
    prisma.rating.count(),
    prisma.historicalRating.count({ where: { catalogImport: { isActive: true } } })
  ]);
  const ratingCount = accountRatingCount + historicalRatingCount;
  return Response.json({ data: { exports, ratingCount } });
}

export async function POST(request: Request) {
  const authorization = await requireAdminRequest(request);
  if (!authorization.user) return authorization.response;
  const adminId = Number(authorization.user.id);
  if (!Number.isSafeInteger(adminId) || adminId < 1) return apiError(401, "INVALID_ADMIN", "Akun administrator tidak valid.");

  try {
    const datasetExport = await createRatingDatasetExport(adminId);
    return Response.json({
      data: { ...datasetExport, ratingRevision: datasetExport.ratingRevision.toString() },
      message: "Snapshot dataset rating berhasil dibuat."
    }, { status: 201 });
  } catch (error) {
    if (error instanceof EmptyRatingDatasetError) return apiError(409, "NO_RATINGS_TO_EXPORT", error.message);
    if (error instanceof RatingDatasetTooLargeError) return apiError(413, "RATING_DATASET_TOO_LARGE", error.message);
    return apiError(500, "DATASET_EXPORT_FAILED", "Snapshot dataset rating tidak dapat dibuat.");
  }
}
