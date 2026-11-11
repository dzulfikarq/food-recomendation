import { z } from "zod";
import { apiError } from "@/lib/food/http";
import { readJobJson } from "@/lib/recommendations/job-request";
import { runRecommendationScheduler } from "@/lib/recommendations/scheduler";
import { recommendationJobErrorResponse } from "@/lib/recommendations/job-api";
import { authorizeWorker, validWorkerId } from "@/lib/recommendations/worker-auth";

const scheduleSchema = z.object({
  workerId: z.string().refine(validWorkerId),
  engineVersion: z.string().min(1).max(40)
}).strict();

export async function POST(request: Request) {
  const authError = authorizeWorker(request);
  if (authError) return authError;
  const parsedBody = await readJobJson(request, 4096);
  if (!parsedBody.ok) return parsedBody.error;
  const input = scheduleSchema.safeParse(parsedBody.value);
  if (!input.success) return apiError(422, "INVALID_SCHEDULER_REQUEST", "Worker ID or engine version is invalid.");
  try {
    const outcome = await runRecommendationScheduler(input.data.workerId, input.data.engineVersion);
    return Response.json({ data: outcome }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return recommendationJobErrorResponse(error);
  }
}
