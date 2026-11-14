import { createHash } from "node:crypto";
import type { ParsedRatingRow } from "@/lib/recommendations/csv";
import { parseRecommendationCsv } from "@/lib/recommendations/csv";
import { RECOMMENDATION_OUTCOME_STATUSES, type RecommendationOutcomeStatus, type RecommendationValidationReport } from "@/lib/recommendations/types";

type ArtifactPayload = {
  recommendations: { userId: number; foodId: number; rank: number; predictedRating: number }[];
  userStatuses: { userId: number; status: RecommendationOutcomeStatus }[];
};

export class RecommendationArtifactPromotionError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/**
 * ponytail: pure, dormant converter. Current DB constraints allow only UNVERIFIED artifacts and closed gates;
 * no runtime caller exists until research validation and an approved gate migration.
 */
export function prepareVerifiedArtifactBatch(input: {
  jobStatus: string;
  jobId: string;
  createdByAdminId: number;
  dataset: { id: number; filename: string; fileChecksum: string; rowCount: number; ratingRevision: bigint; createdAt: Date };
  currentRatingRevision: bigint;
  artifact: {
    verificationStatus: string;
    checksum: string;
    rowCount: number;
    sourceRatingRevision: bigint;
    currentRatingRevision: bigint;
    isStale: boolean;
    payload: unknown;
  };
  gate: { validationStatus: string; autoProcessingEnabled: boolean; automaticPublicationEnabled: boolean };
  parameters: { kNeighbors: number; topN: number; activeFoodIds: number[]; targetUserIds: number[] };
  sourceRatings: ParsedRatingRow[];
}) {
  const { artifact, dataset, parameters } = input;
  if (input.gate.validationStatus !== "VALIDATED" || !input.gate.autoProcessingEnabled || !input.gate.automaticPublicationEnabled) {
    throw new RecommendationArtifactPromotionError("VALIDATION_GATE_CLOSED");
  }
  if (input.jobStatus !== "SUCCEEDED" || artifact.verificationStatus !== "VERIFIED") {
    throw new RecommendationArtifactPromotionError("ARTIFACT_UNVERIFIED");
  }
  if (
    artifact.isStale || artifact.sourceRatingRevision !== dataset.ratingRevision ||
    artifact.sourceRatingRevision !== input.currentRatingRevision || artifact.currentRatingRevision !== input.currentRatingRevision
  ) {
    throw new RecommendationArtifactPromotionError("ARTIFACT_STALE");
  }
  if (!input.parameters.targetUserIds.length || new Set(input.parameters.targetUserIds).size !== input.parameters.targetUserIds.length) {
    throw new RecommendationArtifactPromotionError("ARTIFACT_TARGETS_INVALID");
  }

  const payload = normalizePayload(artifact.payload);
  if (payload.recommendations.length !== artifact.rowCount) throw new RecommendationArtifactPromotionError("ARTIFACT_ROW_COUNT_MISMATCH");
  const canonicalPayload = JSON.stringify(payload);
  if (createHash("sha256").update(canonicalPayload).digest("hex") !== artifact.checksum) {
    throw new RecommendationArtifactPromotionError("ARTIFACT_CHECKSUM_MISMATCH");
  }

  const targets = new Set(input.parameters.targetUserIds);
  const activeFoods = new Set(input.parameters.activeFoodIds);
  const ratedPairs = new Set(input.sourceRatings.map(({ userId, foodId }) => `${userId}:${foodId}`));
  const outcomes = new Map(payload.userStatuses.map(({ userId, status }) => [userId, status]));
  if (outcomes.size !== targets.size || [...targets].some((userId) => !outcomes.has(userId))) {
    throw new RecommendationArtifactPromotionError("ARTIFACT_TARGETS_INVALID");
  }
  const usersWithRecommendations = new Set<number>();
  for (const row of payload.recommendations) {
    const key = `${row.userId}:${row.foodId}`;
    if (
      !targets.has(row.userId) || !activeFoods.has(row.foodId) || ratedPairs.has(key) ||
      row.rank > input.parameters.topN || row.predictedRating < 1 || row.predictedRating > 5
    ) throw new RecommendationArtifactPromotionError("ARTIFACT_ROWS_INVALID");
    usersWithRecommendations.add(row.userId);
  }
  for (const [userId, status] of outcomes) {
    if ((status === "READY") !== usersWithRecommendations.has(userId)) {
      throw new RecommendationArtifactPromotionError("ARTIFACT_STATUS_MISMATCH");
    }
  }

  const csvText = [
    "user_id,item_id,rank",
    ...payload.recommendations.map(({ userId, foodId, rank }) => `${userId},${foodId},${rank}`)
  ].join("\r\n") + "\r\n";
  const csv = Buffer.from(csvText, "utf8");
  const parsed = parseRecommendationCsv(csv, parameters.topN);
  if (parsed.errors.length || parsed.rows.length !== payload.recommendations.length) {
    throw new RecommendationArtifactPromotionError("ARTIFACT_RANKS_INVALID");
  }

  const report: RecommendationValidationReport = {
    source: {
      datasetExportId: dataset.id,
      filename: dataset.filename,
      checksum: dataset.fileChecksum,
      rowCount: dataset.rowCount,
      createdAt: dataset.createdAt.toISOString()
    },
    parameters: { kNeighbors: parameters.kNeighbors, topN: parameters.topN, similarity: "COSINE" },
    summary: {
      totalRows: parsed.totalRows,
      validRows: parsed.totalRows,
      invalidRows: 0,
      recommendationCount: parsed.rows.length,
      userCount: usersWithRecommendations.size,
      sourceUserCount: targets.size,
      usersWithoutRecommendations: targets.size - usersWithRecommendations.size,
      staleDataset: false,
      ratingsAdded: 0,
      ratingsChanged: 0,
      ratingsRemoved: 0,
      ratedAfterExportCount: 0
    },
    errors: [],
    warnings: [],
    preview: [],
    userStatuses: payload.userStatuses
  };

  return {
    csv,
    rows: parsed.rows,
    batch: {
      datasetExportId: dataset.id,
      adminId: input.createdByAdminId,
      status: "VALIDATED" as const,
      kNeighbors: parameters.kNeighbors,
      topN: parameters.topN,
      similarity: "COSINE",
      fileChecksum: createHash("sha256").update(csv).digest("hex"),
      filename: `python-${input.jobId}.csv`,
      validationReport: report
    }
  };
}

function normalizePayload(value: unknown): ArtifactPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RecommendationArtifactPromotionError("ARTIFACT_PAYLOAD_INVALID");
  const source = value as Record<string, unknown>;
  if (!Array.isArray(source.recommendations) || !Array.isArray(source.userStatuses)) throw new RecommendationArtifactPromotionError("ARTIFACT_PAYLOAD_INVALID");
  const recommendations = source.recommendations.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new RecommendationArtifactPromotionError("ARTIFACT_PAYLOAD_INVALID");
    const row = value as Record<string, unknown>;
    if (
      !Number.isSafeInteger(row.userId) || (row.userId as number) < 1 ||
      !Number.isSafeInteger(row.foodId) || (row.foodId as number) < 1 ||
      !Number.isSafeInteger(row.rank) || (row.rank as number) < 1 ||
      typeof row.predictedRating !== "number" || !Number.isFinite(row.predictedRating)
    ) throw new RecommendationArtifactPromotionError("ARTIFACT_PAYLOAD_INVALID");
    return { userId: row.userId as number, foodId: row.foodId as number, rank: row.rank as number, predictedRating: row.predictedRating };
  });
  const userStatuses = source.userStatuses.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new RecommendationArtifactPromotionError("ARTIFACT_PAYLOAD_INVALID");
    const outcome = value as Record<string, unknown>;
    if (
      !Number.isSafeInteger(outcome.userId) || (outcome.userId as number) < 1 || typeof outcome.status !== "string" ||
      !RECOMMENDATION_OUTCOME_STATUSES.includes(outcome.status as RecommendationOutcomeStatus)
    ) throw new RecommendationArtifactPromotionError("ARTIFACT_PAYLOAD_INVALID");
    return { userId: outcome.userId as number, status: outcome.status as RecommendationOutcomeStatus };
  });
  if (new Set(recommendations.map(({ userId, foodId }) => `${userId}:${foodId}`)).size !== recommendations.length) {
    throw new RecommendationArtifactPromotionError("ARTIFACT_ROWS_INVALID");
  }
  if (new Set(userStatuses.map(({ userId }) => userId)).size !== userStatuses.length) {
    throw new RecommendationArtifactPromotionError("ARTIFACT_STATUS_DUPLICATE");
  }
  return { recommendations, userStatuses };
}
