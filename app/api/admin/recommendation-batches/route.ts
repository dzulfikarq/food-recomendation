import { z } from "zod";
import { apiError, requireAdminRequest } from "@/lib/food/http";
import { prisma } from "@/lib/prisma";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
});

function summaryOf(report: unknown) {
  if (!report || typeof report !== "object" || Array.isArray(report)) return null;
  const summary = (report as { summary?: unknown }).summary;
  return summary && typeof summary === "object" && !Array.isArray(summary) ? summary : null;
}

export async function GET(request: Request) {
  const authorization = await requireAdminRequest(request);
  if (!authorization.user) return authorization.response;
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError(400, "INVALID_PAGINATION", "Parameter pagination tidak valid.");
  const { page, pageSize } = parsed.data;
  try {
    const [items, total] = await Promise.all([
      prisma.recommendationBatch.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true, status: true, kNeighbors: true, topN: true, similarity: true, fileChecksum: true, filename: true, createdAt: true, publishedAt: true,
          datasetExport: { select: { id: true, filename: true, fileChecksum: true, rowCount: true, createdAt: true } },
          admin: { select: { id: true, name: true } },
          publishedBy: { select: { id: true, name: true } },
          _count: { select: { recommendations: true } },
          validationReport: true
        }
      }),
      prisma.recommendationBatch.count()
    ]);
    return Response.json({ data: { items: items.map(({ validationReport, ...item }) => ({ ...item, validationSummary: summaryOf(validationReport), errorCount: (validationReport as { errors?: unknown[] } | null)?.errors?.length ?? 0 })), pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } } });
  } catch {
    return apiError(500, "RECOMMENDATION_BATCH_LIST_FAILED", "Riwayat batch rekomendasi tidak dapat dimuat.");
  }
}
