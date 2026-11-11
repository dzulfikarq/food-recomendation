import { z } from "zod";
import { apiError } from "@/lib/food/http";
import { getRecommendationJobStatus } from "@/lib/recommendations/jobs";
import { recommendationJobErrorResponse } from "@/lib/recommendations/job-api";
import { authorizeWorker, workerIdentity } from "@/lib/recommendations/worker-auth";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = authorizeWorker(request);
  if (authError) return authError;
  const identity = workerIdentity(request);
  if (identity.error) return identity.error;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return apiError(400, "INVALID_JOB_ID", "Job ID is invalid.");
  try {
    const status = await getRecommendationJobStatus(id, identity.workerId, identity.leaseToken);
    return Response.json({ data: status }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return recommendationJobErrorResponse(error);
  }
}
