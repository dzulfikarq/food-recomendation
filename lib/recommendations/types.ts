import type { RecommendationCsvError } from "@/lib/recommendations/csv";

export const RECOMMENDATION_OUTCOME_STATUSES = [
  "READY",
  "COLD_START",
  "NO_CANDIDATES",
  "NO_NEIGHBORS",
  "NO_PREDICTIONS"
] as const;

export type RecommendationOutcomeStatus = typeof RECOMMENDATION_OUTCOME_STATUSES[number];
export type UserRecommendationStatus = "READY" | "NO_RATINGS" | "NO_BATCH" | "NOT_INCLUDED" | "ALL_RATED" | "NO_AVAILABLE_FOODS" | "NO_NEIGHBORS" | "NO_PREDICTIONS" | "PROCESSING" | "PROCESSING_FAILED";

export type RecommendationPreviewRow = {
  row: number;
  userId: number;
  userName: string | null;
  foodId: number;
  foodName: string | null;
  category: string | null;
  imageUrl: string | null;
  rank: number;
  valid: boolean;
};

export type RecommendationValidationReport = {
  source: { datasetExportId: number; filename: string; checksum: string; rowCount: number; createdAt: string };
  parameters: { kNeighbors: number; topN: number; similarity: "COSINE" };
  summary: {
    totalRows: number;
    validRows: number;
    invalidRows: number;
    recommendationCount: number;
    userCount: number;
    sourceUserCount: number;
    usersWithoutRecommendations: number;
    staleDataset: boolean;
    ratingsAdded: number;
    ratingsChanged: number;
    ratingsRemoved: number;
    ratedAfterExportCount: number;
  };
  errors: RecommendationCsvError[];
  warnings: { code: string; message: string }[];
  preview: RecommendationPreviewRow[];
  userStatuses?: { userId: number; status: RecommendationOutcomeStatus }[];
  artifactVerification?: {
    status: "REVERIFIED_FOR_LOCAL_PROTOTYPE";
    storedArtifactStatus: string;
    artifactId: string;
    artifactChecksum: string;
    jobId: string;
    engineVersion: string;
    datasetRevision: string;
    currentRevision: string;
    parameters: { kNeighbors: number; topN: number; minCommonRatings: number; similarityStrategy: "overlap" };
    cohortUserCount: number;
    candidateFoodCount: number;
    outcomeCounts: Record<RecommendationOutcomeStatus, number>;
  };
};
