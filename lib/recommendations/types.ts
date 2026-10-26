import type { RecommendationCsvError } from "@/lib/recommendations/csv";

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
};
