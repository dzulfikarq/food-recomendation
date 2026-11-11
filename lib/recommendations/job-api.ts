import { apiError } from "@/lib/food/http";
import { RecommendationJobError } from "@/lib/recommendations/jobs";

export function recommendationJobErrorResponse(error: unknown) {
  if (error instanceof RecommendationJobError) return apiError(error.status, error.code, error.message);
  const details = error && typeof error === "object" && "code" in error ? String(error.code) : error instanceof Error ? error.name : "UnknownError";
  const meta = error && typeof error === "object" && "meta" in error && error.meta && typeof error.meta === "object"
    ? error.meta as { driverAdapterError?: { cause?: { originalCode?: string } } }
    : undefined;
  console.error("Recommendation job operation failed:", details, meta?.driverAdapterError?.cause?.originalCode ?? "");
  return apiError(500, "RECOMMENDATION_JOB_ERROR", "Recommendation job operation failed.");
}
