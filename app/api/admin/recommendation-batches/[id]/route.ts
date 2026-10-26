import { z } from "zod";
import { apiError, parseFoodId, requireAdminRequest } from "@/lib/food/http";
import { prisma } from "@/lib/prisma";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50)
});

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await requireAdminRequest(request);
  if (!authorization.user) return authorization.response;
  const id = parseFoodId((await params).id);
  if (!id) return apiError(400, "INVALID_BATCH_ID", "ID batch tidak valid.");
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError(400, "INVALID_PAGINATION", "Parameter pagination tidak valid.");
  const { page, pageSize } = parsed.data;
  try {
    const batch = await prisma.recommendationBatch.findUnique({
      where: { id },
      select: {
        id: true, datasetExportId: true, adminId: true, publishedById: true, status: true, kNeighbors: true, topN: true, similarity: true,
        fileChecksum: true, filename: true, createdAt: true, publishedAt: true, validationReport: true,
        datasetExport: { select: { id: true, filename: true, fileChecksum: true, rowCount: true, createdAt: true } },
        admin: { select: { id: true, name: true } }, publishedBy: { select: { id: true, name: true } },
        _count: { select: { recommendations: true } }
      }
    });
    if (!batch) return apiError(404, "BATCH_NOT_FOUND", "Batch rekomendasi tidak ditemukan.");
    const [recommendations, total] = await Promise.all([
      prisma.recommendation.findMany({
        where: { batchId: id }, orderBy: [{ userId: "asc" }, { rank: "asc" }], skip: (page - 1) * pageSize, take: pageSize,
        select: { userId: true, rank: true, foodId: true, user: { select: { name: true } }, food: { select: { name: true, category: true, imageUrl: true, isActive: true } } }
      }),
      prisma.recommendation.count({ where: { batchId: id } })
    ]);
    return Response.json({ data: { batch, recommendations, pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } } });
  } catch {
    return apiError(500, "BATCH_READ_FAILED", "Detail batch rekomendasi tidak dapat dimuat.");
  }
}
