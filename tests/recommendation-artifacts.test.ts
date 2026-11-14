import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { prepareVerifiedArtifactBatch, RecommendationArtifactPromotionError } from "@/lib/recommendations/artifact-promotion";

const payload: {
  recommendations: { userId: number; foodId: number; rank: number; predictedRating: number }[];
  userStatuses: { userId: number; status: string }[];
} = {
  recommendations: [{ userId: 7, foodId: 12, rank: 1, predictedRating: 4.5 }],
  userStatuses: [{ userId: 7, status: "READY" as const }, { userId: 8, status: "NO_NEIGHBORS" as const }]
};
const payloadChecksum = createHash("sha256").update(JSON.stringify(payload)).digest("hex");

const input = () => ({
  jobStatus: "SUCCEEDED",
  jobId: "48de43e0-f7f9-4616-a6a5-646dd6f8732d",
  createdByAdminId: 3,
  dataset: {
    id: 4,
    filename: "ratings.csv",
    fileChecksum: "a".repeat(64),
    rowCount: 3,
    ratingRevision: BigInt(20),
    createdAt: new Date("2026-11-14T00:00:00.000Z")
  },
  currentRatingRevision: BigInt(20),
  artifact: {
    verificationStatus: "VERIFIED",
    checksum: payloadChecksum,
    rowCount: 1,
    sourceRatingRevision: BigInt(20),
    currentRatingRevision: BigInt(20),
    isStale: false,
    payload
  },
  gate: { validationStatus: "VALIDATED", autoProcessingEnabled: true, automaticPublicationEnabled: true },
  parameters: { kNeighbors: 2, topN: 3, activeFoodIds: [10, 11, 12], targetUserIds: [7, 8] },
  sourceRatings: [{ userId: 7, foodId: 10, rating: 5 }]
});

function assertPromotionError(run: () => unknown, code: string) {
  assert.throws(run, (error: unknown) => error instanceof RecommendationArtifactPromotionError && error.code === code);
}

test("artifact batch preparation requires closed gate to open, VERIFIED payload, and exact fresh revision", () => {
  const unverified = input();
  unverified.artifact.verificationStatus = "UNVERIFIED";
  assertPromotionError(() => prepareVerifiedArtifactBatch(unverified), "ARTIFACT_UNVERIFIED");

  const stale = input();
  stale.artifact.isStale = true;
  assertPromotionError(() => prepareVerifiedArtifactBatch(stale), "ARTIFACT_STALE");

  const changed = input();
  changed.currentRatingRevision = BigInt(21);
  assertPromotionError(() => prepareVerifiedArtifactBatch(changed), "ARTIFACT_STALE");

  const closed = input();
  closed.gate.validationStatus = "PENDING_VALIDATION";
  assertPromotionError(() => prepareVerifiedArtifactBatch(closed), "VALIDATION_GATE_CLOSED");
});

test("verified fresh artifact converts to validated batch input while preserving per-user outcomes", () => {
  const prepared = prepareVerifiedArtifactBatch(input());
  assert.equal(prepared.batch.status, "VALIDATED");
  assert.equal(prepared.batch.datasetExportId, 4);
  assert.deepEqual(prepared.rows.map(({ userId, itemId, rank }) => [userId, itemId, rank]), [[7, 12, 1]]);
  assert.equal(prepared.csv.toString("utf8"), "user_id,item_id,rank\r\n7,12,1\r\n");
  assert.deepEqual(prepared.batch.validationReport.userStatuses, payload.userStatuses);
  assert.equal(prepared.batch.validationReport.summary.staleDataset, false);
});

test("artifact conversion rejects tampered payload and status-row mismatch", () => {
  const tampered = input();
  tampered.artifact.payload = { ...payload, recommendations: [] };
  assertPromotionError(() => prepareVerifiedArtifactBatch(tampered), "ARTIFACT_ROW_COUNT_MISMATCH");

  const mismatch = input();
  mismatch.artifact.payload = {
    ...payload,
    userStatuses: [{ userId: 7, status: "NO_PREDICTIONS" }, { userId: 8, status: "NO_NEIGHBORS" }]
  };
  mismatch.artifact.checksum = createHash("sha256").update(JSON.stringify(mismatch.artifact.payload)).digest("hex");
  assertPromotionError(() => prepareVerifiedArtifactBatch(mismatch), "ARTIFACT_STATUS_MISMATCH");
});
