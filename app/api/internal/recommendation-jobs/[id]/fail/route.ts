import { z } from "zod";
import { apiError } from "@/lib/food/http";
import { failRecommendationJob } from "@/lib/recommendations/jobs";
import { readJobJson } from "@/lib/recommendations/job-request";
import { recommendationJobErrorResponse } from "@/lib/recommendations/job-api";
import { authorizeWorker, workerIdentity } from "@/lib/recommendations/worker-auth";

const failureSchema = z.object({
  code: z.enum(["ENGINE_ERROR", "SNAPSHOT_CHECKSUM_MISMATCH", "SNAPSHOT_INVALID", "SNAPSHOT_UNAVAILABLE", "TIMEOUT", "WORKER_ERROR"])
}).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = authorizeWorker(request);
  if (authError) return authError;
  const identity = workerIdentity(request);
  if (identity.error) return identity.error;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return apiError(400, "INVALID_JOB_ID", "Job ID is invalid.");
  const parsedBody = await readJobJson(request, 4096);
  if (!parsedBody.ok) return parsedBody.error;
  const input = failureSchema.safeParse(parsedBody.value);
  if (!input.success) return apiError(422, "INVALID_FAILURE", "Failure code is invalid.");
  try {
    const result = await failRecommendationJob(id, identity.workerId, identity.leaseToken, input.data.code);
    return Response.json({ data: result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return recommendationJobErrorResponse(error);
  }
}
