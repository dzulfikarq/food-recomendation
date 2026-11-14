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

export function prepareTestPrototypeBatch(input: {
  job: { id: string; status: string; engineVersion: string; datasetExportId: number };
  createdByAdminId: number;
  dataset: { id: number; filename: string; fileChecksum: string; rowCount: number; ratingRevision: bigint; createdAt: Date };
  currentRatingRevision: bigint;
  artifact: {
    id: string;
    verificationStatus: string;
    checksum: string;
    rowCount: number;
    sourceRatingRevision: bigint;
    currentRatingRevision: bigint;
    isStale: boolean;
    payload: unknown;
  };
  config: { validationStatus: string; autoProcessingEnabled: boolean; automaticPublicationEnabled: boolean };
  parameters: {
    kNeighbors: number;
    topN: number;
    minCommonRatings: number;
    similarityStrategy: "overlap";
    activeFoodIds: number[];
    targetUserIds: number[];
  };
  currentActiveFoodIds: number[];
  currentTargetUserIds: number[];
  sourceRatings: ParsedRatingRow[];
}) {
  const { job, dataset, artifact, parameters } = input;
  if (
    input.config.validationStatus !== "PENDING_VALIDATION" ||
    input.config.autoProcessingEnabled || input.config.automaticPublicationEnabled
  ) {
    throw new RecommendationArtifactPromotionError("AUTOMATION_GATES_MUST_REMAIN_CLOSED");
  }
  if (job.status !== "SUCCEEDED" || job.engineVersion !== "python-ubcf-v1" || job.datasetExportId !== dataset.id) {
    throw new RecommendationArtifactPromotionError("JOB_INVALID");
  }
  if (artifact.verificationStatus !== "UNVERIFIED") throw new RecommendationArtifactPromotionError("ARTIFACT_STATUS_INVALID");
  if (
    artifact.isStale || artifact.sourceRatingRevision !== dataset.ratingRevision ||
    artifact.sourceRatingRevision !== input.currentRatingRevision || artifact.currentRatingRevision !== input.currentRatingRevision
  ) throw new RecommendationArtifactPromotionError("ARTIFACT_STALE");
  if (
    !Number.isSafeInteger(parameters.kNeighbors) || parameters.kNeighbors < 1 ||
    !Number.isSafeInteger(parameters.topN) || parameters.topN < 1 ||
    !Number.isSafeInteger(parameters.minCommonRatings) || parameters.minCommonRatings < 1 ||
    parameters.similarityStrategy !== "overlap" || !samePositiveIds(parameters.activeFoodIds, input.currentActiveFoodIds) ||
    !samePositiveIds(parameters.targetUserIds, input.currentTargetUserIds)
  ) throw new RecommendationArtifactPromotionError("JOB_PARAMETERS_OR_COHORT_INVALID");

  const payload = normalizePayload(artifact.payload);
  if (payload.recommendations.length !== artifact.rowCount) throw new RecommendationArtifactPromotionError("ARTIFACT_ROW_COUNT_MISMATCH");
  if (createHash("sha256").update(JSON.stringify(payload)).digest("hex") !== artifact.checksum) {
    throw new RecommendationArtifactPromotionError("ARTIFACT_CHECKSUM_MISMATCH");
  }

  const activeFoods = new Set(parameters.activeFoodIds);
  const targets = new Set(parameters.targetUserIds);
  const ratedFoodsByUser = new Map<number, Set<number>>();
  const ratingsByUser = new Map<number, Map<number, number>>();
  for (const { userId, foodId, rating } of input.sourceRatings) {
    const foods = ratedFoodsByUser.get(userId) ?? new Set<number>();
    foods.add(foodId);
    ratedFoodsByUser.set(userId, foods);
    const ratings = ratingsByUser.get(userId) ?? new Map<number, number>();
    ratings.set(foodId, rating);
    ratingsByUser.set(userId, ratings);
  }
  const rowsByUser = new Map<number, typeof payload.recommendations>();
  for (const row of payload.recommendations) {
    if (
      !targets.has(row.userId) || !activeFoods.has(row.foodId) || ratedFoodsByUser.get(row.userId)?.has(row.foodId) ||
      row.rank > parameters.topN || row.predictedRating < 1 || row.predictedRating > 5
    ) throw new RecommendationArtifactPromotionError("ARTIFACT_RECOMMENDATION_INVALID");
    const rows = rowsByUser.get(row.userId) ?? [];
    rows.push(row);
    rowsByUser.set(row.userId, rows);
  }
  for (const rows of rowsByUser.values()) {
    rows.sort((left, right) => left.rank - right.rank);
    if (rows.some((row, index) => row.rank !== index + 1)) throw new RecommendationArtifactPromotionError("ARTIFACT_RANKS_INVALID");
    if (rows.some((row, index) => index > 0 && (
      rows[index - 1]!.predictedRating < row.predictedRating ||
      (rows[index - 1]!.predictedRating === row.predictedRating && rows[index - 1]!.foodId > row.foodId)
    ))) throw new RecommendationArtifactPromotionError("ARTIFACT_ORDER_INVALID");
  }

  const outcomes = new Map(payload.userStatuses.map(({ userId, status }) => [userId, status]));
  if (outcomes.size !== targets.size || [...targets].some((userId) => !outcomes.has(userId))) {
    throw new RecommendationArtifactPromotionError("ARTIFACT_COHORT_INVALID");
  }
  for (const [userId, status] of outcomes) {
    const expected = expectedRecommendations(userId, ratingsByUser, [...activeFoods], parameters);
    const actual = rowsByUser.get(userId) ?? [];
    if (status !== expected.status || actual.length !== expected.rows.length || actual.some((row, index) =>
      row.foodId !== expected.rows[index]!.foodId || Math.abs(row.predictedRating - expected.rows[index]!.predictedRating) > 1e-10
    )) throw new RecommendationArtifactPromotionError("ARTIFACT_PREDICTION_MISMATCH");
  }

  const csv = Buffer.from([
    "user_id,item_id,rank",
    ...payload.recommendations.map(({ userId, foodId, rank }) => `${userId},${foodId},${rank}`)
  ].join("\r\n") + "\r\n", "utf8");
  if (payload.recommendations.length) {
    const parsed = parseRecommendationCsv(csv, parameters.topN);
    if (parsed.errors.length || parsed.rows.length !== payload.recommendations.length) {
      throw new RecommendationArtifactPromotionError("ARTIFACT_RANKS_INVALID");
    }
  }

  const outcomeCounts = Object.fromEntries(RECOMMENDATION_OUTCOME_STATUSES.map((status) => [
    status,
    payload.userStatuses.filter((outcome) => outcome.status === status).length
  ])) as Record<RecommendationOutcomeStatus, number>;
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
      totalRows: payload.recommendations.length,
      validRows: payload.recommendations.length,
      invalidRows: 0,
      recommendationCount: payload.recommendations.length,
      userCount: rowsByUser.size,
      sourceUserCount: targets.size,
      usersWithoutRecommendations: targets.size - rowsByUser.size,
      staleDataset: false,
      ratingsAdded: 0,
      ratingsChanged: 0,
      ratingsRemoved: 0,
      ratedAfterExportCount: 0
    },
    errors: [],
    warnings: [],
    preview: [],
    userStatuses: payload.userStatuses,
    artifactVerification: {
      status: "REVERIFIED_FOR_LOCAL_PROTOTYPE",
      storedArtifactStatus: artifact.verificationStatus,
      artifactId: artifact.id,
      artifactChecksum: artifact.checksum,
      jobId: job.id,
      engineVersion: job.engineVersion,
      datasetRevision: dataset.ratingRevision.toString(),
      currentRevision: input.currentRatingRevision.toString(),
      parameters: {
        kNeighbors: parameters.kNeighbors,
        topN: parameters.topN,
        minCommonRatings: parameters.minCommonRatings,
        similarityStrategy: parameters.similarityStrategy
      },
      cohortUserCount: targets.size,
      candidateFoodCount: activeFoods.size,
      outcomeCounts
    }
  };

  return {
    csv,
    rows: payload.recommendations,
    report,
    batch: {
      datasetExportId: dataset.id,
      adminId: input.createdByAdminId,
      status: "PUBLISHED" as const,
      kNeighbors: parameters.kNeighbors,
      topN: parameters.topN,
      similarity: "COSINE",
      fileChecksum: createHash("sha256").update(csv).digest("hex"),
      filename: `python-${job.id}.csv`
    }
  };
}

function samePositiveIds(left: number[], right: number[]) {
  return left.every((id) => Number.isSafeInteger(id) && id > 0) && right.every((id) => Number.isSafeInteger(id) && id > 0) &&
    new Set(left).size === left.length && new Set(right).size === right.length &&
    left.length === right.length && left.every((id) => right.includes(id));
}

function expectedRecommendations(
  userId: number,
  ratingsByUser: Map<number, Map<number, number>>,
  activeFoodIds: number[],
  parameters: { kNeighbors: number; topN: number; minCommonRatings: number }
) {
  const targetRatings = ratingsByUser.get(userId) ?? new Map<number, number>();
  if (!targetRatings.size) return { status: "COLD_START" as const, rows: [] };
  const candidates = activeFoodIds.filter((foodId) => !targetRatings.has(foodId));
  if (!candidates.length) return { status: "NO_CANDIDATES" as const, rows: [] };

  const neighbors: { userId: number; similarity: number; ratings: Map<number, number> }[] = [];
  for (const [otherUserId, otherRatings] of ratingsByUser) {
    if (otherUserId === userId) continue;
    const common = [...targetRatings.keys()].filter((foodId) => otherRatings.has(foodId));
    if (common.length < parameters.minCommonRatings) continue;
    let dot = 0;
    let leftSquares = 0;
    let rightSquares = 0;
    for (const foodId of common) {
      const left = targetRatings.get(foodId)!;
      const right = otherRatings.get(foodId)!;
      dot += left * right;
      leftSquares += left * left;
      rightSquares += right * right;
    }
    const denominator = Math.sqrt(leftSquares) * Math.sqrt(rightSquares);
    const similarity = Math.max(-1, Math.min(1, dot / denominator));
    if (denominator > 0 && similarity > 0) neighbors.push({ userId: otherUserId, similarity, ratings: otherRatings });
  }
  neighbors.sort((left, right) => right.similarity - left.similarity || left.userId - right.userId);
  const selected = neighbors.slice(0, parameters.kNeighbors);
  if (!selected.length) return { status: "NO_NEIGHBORS" as const, rows: [] };

  const predictions = candidates.flatMap((foodId) => {
    const weighted = selected.flatMap((neighbor) => {
      const rating = neighbor.ratings.get(foodId);
      return rating === undefined ? [] : [{ weight: neighbor.similarity, rating }];
    });
    const weightSum = weighted.reduce((sum, { weight }) => sum + weight, 0);
    if (!weightSum) return [];
    const value = weighted.reduce((sum, { weight, rating }) => sum + weight * rating, 0) / weightSum;
    const ratings = weighted.map(({ rating }) => rating);
    return [{ foodId, predictedRating: Math.min(Math.max(...ratings), Math.max(Math.min(...ratings), value)) }];
  });
  if (!predictions.length) return { status: "NO_PREDICTIONS" as const, rows: [] };
  predictions.sort((left, right) => right.predictedRating - left.predictedRating || left.foodId - right.foodId);
  return { status: "READY" as const, rows: predictions.slice(0, parameters.topN) };
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
    throw new RecommendationArtifactPromotionError("ARTIFACT_ROWS_DUPLICATE");
  }
  if (new Set(userStatuses.map(({ userId }) => userId)).size !== userStatuses.length) {
    throw new RecommendationArtifactPromotionError("ARTIFACT_STATUS_DUPLICATE");
  }
  return { recommendations, userStatuses };
}
