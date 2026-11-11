import { z } from "zod";
import { apiError, requireAdminRequest, validationError } from "@/lib/food/http";
import { createRecommendationJob } from "@/lib/recommendations/jobs";
import { readJobJson } from "@/lib/recommendations/job-request";
import { recommendationJobErrorResponse } from "@/lib/recommendations/job-api";

const requestSchema = z.object({
  datasetExportId: z.number().int().positive().safe(),
  kNeighbors: z.number().int().min(1).max(100),
  topN: z.number().int().min(1).max(100),
  idempotencyKey: z.string().uuid()
}).strict();

export async function POST(request: Request) {
  const authorization = await requireAdminRequest(request);
  if (!authorization.user) return authorization.response;
  const parsedBody = await readJobJson(request, 4096);
  if (!parsedBody.ok) return parsedBody.error;
  const input = requestSchema.safeParse(parsedBody.value);
  if (!input.success) return validationError(input.error);
  const adminId = Number(authorization.user.id);
  if (!Number.isSafeInteger(adminId) || adminId < 1) return apiError(401, "INVALID_ADMIN", "Administrator identity is invalid.");

  try {
    const result = await createRecommendationJob({ ...input.data, createdByAdminId: adminId });
    return Response.json({ data: { id: result.job.id, status: result.job.status, createdAt: result.job.createdAt } }, { status: result.created ? 201 : 200 });
  } catch (error) {
    return recommendationJobErrorResponse(error);
  }
}
