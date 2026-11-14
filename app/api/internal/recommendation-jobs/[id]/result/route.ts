import { z } from "zod";
import { apiError } from "@/lib/food/http";
import { MAX_JOB_RESULT_BYTES, MAX_JOB_RESULT_ROWS, submitRecommendationJobResult } from "@/lib/recommendations/jobs";
import { readJobJson } from "@/lib/recommendations/job-request";
import { recommendationJobErrorResponse } from "@/lib/recommendations/job-api";
import { authorizeWorker, workerIdentity } from "@/lib/recommendations/worker-auth";
import { RECOMMENDATION_OUTCOME_STATUSES } from "@/lib/recommendations/types";

const resultSchema = z.object({
  recommendations: z.array(z.object({
    userId: z.number().int().positive().safe(),
    foodId: z.number().int().positive().safe(),
    rank: z.number().int().positive().max(100),
    predictedRating: z.number().finite().min(1).max(5)
  }).strict()).max(MAX_JOB_RESULT_ROWS),
  userStatuses: z.array(z.object({
    userId: z.number().int().positive().safe(),
    status: z.enum(RECOMMENDATION_OUTCOME_STATUSES)
  }).strict()).max(MAX_JOB_RESULT_ROWS).optional()
}).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = authorizeWorker(request);
  if (authError) return authError;
  const identity = workerIdentity(request);
  if (identity.error) return identity.error;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return apiError(400, "INVALID_JOB_ID", "Job ID is invalid.");
  const parsedBody = await readJobJson(request, MAX_JOB_RESULT_BYTES);
  if (!parsedBody.ok) return parsedBody.error;
  const input = resultSchema.safeParse(parsedBody.value);
  if (!input.success) return apiError(422, "INVALID_RESULT", "Worker result payload is invalid.");
  try {
    const result = await submitRecommendationJobResult(id, identity.workerId, identity.leaseToken, input.data.recommendations, input.data.userStatuses);
    return Response.json({ data: result }, { status: result.idempotent ? 200 : 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return recommendationJobErrorResponse(error);
  }
}
