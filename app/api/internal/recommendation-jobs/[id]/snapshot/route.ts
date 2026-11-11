import { z } from "zod";
import { apiError } from "@/lib/food/http";
import { getRecommendationJobSnapshot } from "@/lib/recommendations/jobs";
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
    const snapshot = await getRecommendationJobSnapshot(id, identity.workerId, identity.leaseToken);
    return new Response(new Uint8Array(snapshot.buffer), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Length": String(snapshot.buffer.byteLength),
        "X-FoodRec-Snapshot-SHA256": snapshot.checksum,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    return recommendationJobErrorResponse(error);
  }
}
