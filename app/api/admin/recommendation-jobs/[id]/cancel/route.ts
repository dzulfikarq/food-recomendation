import { z } from "zod";
import { apiError, requireAdminRequest } from "@/lib/food/http";
import { cancelRecommendationJob } from "@/lib/recommendations/jobs";
import { recommendationJobErrorResponse } from "@/lib/recommendations/job-api";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await requireAdminRequest(request);
  if (!authorization.user) return authorization.response;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return apiError(400, "INVALID_JOB_ID", "Job ID is invalid.");
  try {
    const result = await cancelRecommendationJob(id);
    return Response.json({ data: result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return recommendationJobErrorResponse(error);
  }
}
