import { z } from "zod";
import { apiError } from "@/lib/food/http";
import { readJobJson } from "@/lib/recommendations/job-request";
import { claimRecommendationJob } from "@/lib/recommendations/jobs";
import { recommendationJobErrorResponse } from "@/lib/recommendations/job-api";
import { authorizeWorker, validWorkerId } from "@/lib/recommendations/worker-auth";

const claimSchema = z.object({ workerId: z.string().refine(validWorkerId) }).strict();

export async function POST(request: Request) {
  const authError = authorizeWorker(request);
  if (authError) return authError;
  const parsedBody = await readJobJson(request, 4096);
  if (!parsedBody.ok) return parsedBody.error;
  const input = claimSchema.safeParse(parsedBody.value);
  if (!input.success) return apiError(422, "INVALID_WORKER_ID", "Worker ID is invalid.");
  try {
    const job = await claimRecommendationJob(input.data.workerId);
    return job
      ? Response.json({ data: job }, { headers: { "Cache-Control": "no-store" } })
      : new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return recommendationJobErrorResponse(error);
  }
}
