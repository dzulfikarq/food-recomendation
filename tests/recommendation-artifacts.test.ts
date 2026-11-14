import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { prepareTestPrototypeBatch, RecommendationArtifactPromotionError } from "@/lib/recommendations/artifact-promotion";

const payload: {
  recommendations: { userId: number; foodId: number; rank: number; predictedRating: number }[];
  userStatuses: { userId: number; status: string }[];
} = {
  recommendations: [{ userId: 7, foodId: 12, rank: 1, predictedRating: 4 }],
  userStatuses: [
    { userId: 7, status: "READY" },
    { userId: 8, status: "NO_PREDICTIONS" },
    { userId: 9, status: "NO_NEIGHBORS" }
  ]
};
const payloadChecksum = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

const input = () => ({
  job: { id: "48de43e0-f7f9-4616-a6a5-646dd6f8732d", status: "SUCCEEDED", engineVersion: "python-ubcf-v1", datasetExportId: 4 },
  createdByAdminId: 3,
  dataset: {
    id: 4,
    filename: "ratings.csv",
    fileChecksum: "a".repeat(64),
    rowCount: 4,
    ratingRevision: BigInt(20),
    createdAt: new Date("2026-11-14T00:00:00.000Z")
  },
  currentRatingRevision: BigInt(20),
  artifact: {
    id: "f4c915e8-2875-4b5c-b7b3-5a4a0d193c65",
    verificationStatus: "UNVERIFIED",
    checksum: payloadChecksum(payload),
    rowCount: 1,
    sourceRatingRevision: BigInt(20),
    currentRatingRevision: BigInt(20),
    isStale: false,
    payload
  },
  config: { validationStatus: "PENDING_VALIDATION", autoProcessingEnabled: false, automaticPublicationEnabled: false },
  parameters: {
    kNeighbors: 2,
    topN: 3,
    minCommonRatings: 1,
    similarityStrategy: "overlap" as const,
    activeFoodIds: [10, 11, 12],
    targetUserIds: [7, 8, 9]
  },
  currentActiveFoodIds: [10, 11, 12],
  currentTargetUserIds: [7, 8, 9],
  sourceRatings: [
    { userId: 7, foodId: 10, rating: 5 },
    { userId: 8, foodId: 10, rating: 5 },
    { userId: 8, foodId: 12, rating: 4 },
    { userId: 9, foodId: 11, rating: 4 }
  ]
});

function assertPromotionError(run: () => unknown, code: string) {
  assert.throws(run, (error: unknown) => error instanceof RecommendationArtifactPromotionError && error.code === code);
}

test("prototype promotion rechecks stale revisions, stored state, checksum, cohort, and closed automation gates", () => {
  const stale = input();
  stale.artifact.isStale = true;
  assertPromotionError(() => prepareTestPrototypeBatch(stale), "ARTIFACT_STALE");

  const changed = input();
  changed.currentRatingRevision = BigInt(21);
  assertPromotionError(() => prepareTestPrototypeBatch(changed), "ARTIFACT_STALE");

  const wrongChecksum = input();
  wrongChecksum.artifact.checksum = "0".repeat(64);
  assertPromotionError(() => prepareTestPrototypeBatch(wrongChecksum), "ARTIFACT_CHECKSUM_MISMATCH");

  const wrongCohort = input();
  wrongCohort.currentTargetUserIds = [7];
  assertPromotionError(() => prepareTestPrototypeBatch(wrongCohort), "JOB_PARAMETERS_OR_COHORT_INVALID");

  const openGate = input();
  openGate.config.automaticPublicationEnabled = true;
  assertPromotionError(() => prepareTestPrototypeBatch(openGate), "AUTOMATION_GATES_MUST_REMAIN_CLOSED");

  const qualityStatusChanged = input();
  qualityStatusChanged.config.validationStatus = "VERIFIED";
  assertPromotionError(() => prepareTestPrototypeBatch(qualityStatusChanged), "AUTOMATION_GATES_MUST_REMAIN_CLOSED");
});

test("verified Python output becomes a published batch with audited parameters and outcomes", () => {
  const prepared = prepareTestPrototypeBatch(input());
  assert.equal(prepared.batch.status, "PUBLISHED");
  assert.equal(prepared.batch.datasetExportId, 4);
  assert.deepEqual(prepared.rows.map(({ userId, foodId, rank, predictedRating }) => [userId, foodId, rank, predictedRating]), [[7, 12, 1, 4]]);
  assert.equal(prepared.csv.toString("utf8"), "user_id,item_id,rank\r\n7,12,1\r\n");
  assert.equal(prepared.report.artifactVerification?.status, "REVERIFIED_FOR_LOCAL_PROTOTYPE");
  assert.equal(prepared.report.artifactVerification?.storedArtifactStatus, "UNVERIFIED");
  assert.deepEqual(prepared.report.userStatuses, payload.userStatuses);
  assert.equal(prepared.report.summary.staleDataset, false);
});

test("verification rejects rated/inactive candidates, invalid score/rank/order, and mismatched outcomes", () => {
  for (const change of [
    { row: { foodId: 10 }, code: "ARTIFACT_RECOMMENDATION_INVALID" },
    { row: { foodId: 99 }, code: "ARTIFACT_RECOMMENDATION_INVALID" },
    { row: { predictedRating: 5.1 }, code: "ARTIFACT_RECOMMENDATION_INVALID" },
    { row: { rank: 4 }, code: "ARTIFACT_RECOMMENDATION_INVALID" },
    { statuses: [{ userId: 7, status: "NO_PREDICTIONS" }, { userId: 8, status: "NO_NEIGHBORS" }, { userId: 9, status: "NO_NEIGHBORS" }], code: "ARTIFACT_PREDICTION_MISMATCH" }
  ]) {
    const invalid = input();
    if (change.row) invalid.artifact.payload = {
      ...payload,
      recommendations: [{ ...payload.recommendations[0]!, ...change.row }]
    };
    if (change.statuses) invalid.artifact.payload = { ...payload, userStatuses: change.statuses };
    invalid.artifact.checksum = payloadChecksum(invalid.artifact.payload);
    assertPromotionError(() => prepareTestPrototypeBatch(invalid), change.code);
  }
});

test("no-neighbor outcomes publish an auditable empty batch without inventing predictions", () => {
  const empty = input();
  const emptyPayload = {
    recommendations: [],
    userStatuses: [
      { userId: 7, status: "NO_NEIGHBORS" },
      { userId: 8, status: "NO_NEIGHBORS" },
      { userId: 9, status: "NO_NEIGHBORS" }
    ]
  };
  empty.parameters.activeFoodIds = [10, 11, 12, 13];
  empty.currentActiveFoodIds = [10, 11, 12, 13];
  empty.sourceRatings = [
    { userId: 7, foodId: 10, rating: 5 },
    { userId: 8, foodId: 11, rating: 4 },
    { userId: 9, foodId: 12, rating: 3 }
  ];
  empty.dataset.rowCount = 3;
  empty.artifact.payload = emptyPayload;
  empty.artifact.checksum = payloadChecksum(emptyPayload);
  empty.artifact.rowCount = 0;
  const prepared = prepareTestPrototypeBatch(empty);
  assert.equal(prepared.rows.length, 0);
  assert.equal(prepared.report.summary.usersWithoutRecommendations, 3);
  assert.match(prepared.csv.toString("utf8"), /^user_id,item_id,rank\r\n$/);
});
