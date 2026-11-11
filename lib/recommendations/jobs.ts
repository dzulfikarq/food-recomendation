import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Prisma, type RecommendationJobStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { readRatingExport } from "@/lib/food/storage";
import { parseRatingSnapshotCsv } from "@/lib/recommendations/csv";

export const RECOMMENDATION_ENGINE_VERSION = "python-ubcf-v1";
export const JOB_LEASE_SECONDS = 60;
export const MAX_JOB_SNAPSHOT_BYTES = 20 * 1024 * 1024;
export const MAX_JOB_RESULT_BYTES = 2 * 1024 * 1024;
export const MAX_JOB_RESULT_ROWS = 10_000;
const MAX_ACTIVE_FOODS = 10_000;
const MAX_JOB_ATTEMPTS = 3;
const JOB_TIMEOUT_SECONDS = 15 * 60;

export type JobParameters = {
  kNeighbors: number;
  topN: number;
  minCommonRatings: number;
  similarityStrategy: "overlap";
  activeFoodIds: number[];
};

export type JobRecommendation = {
  userId: number;
  foodId: number;
  rank: number;
  predictedRating: number;
};

export class RecommendationJobError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) {
    super(message);
  }
}

function digest(buffer: Buffer | string) {
  return createHash("sha256").update(buffer).digest("hex");
}

function parametersFrom(value: Prisma.JsonValue): JobParameters {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RecommendationJobError("INVALID_JOB_PARAMETERS", 500, "Job parameters are invalid.");
  }
  const parameters = value as Record<string, Prisma.JsonValue>;
  const { kNeighbors, topN, minCommonRatings, similarityStrategy, activeFoodIds } = parameters;
  if (
    !Number.isSafeInteger(kNeighbors) || (kNeighbors as number) < 1 || (kNeighbors as number) > 100 ||
    !Number.isSafeInteger(topN) || (topN as number) < 1 || (topN as number) > 100 ||
    !Number.isSafeInteger(minCommonRatings) || (minCommonRatings as number) < 1 ||
    similarityStrategy !== "overlap" || !Array.isArray(activeFoodIds) || activeFoodIds.length > MAX_ACTIVE_FOODS ||
    activeFoodIds.some((foodId) => !Number.isSafeInteger(foodId) || (foodId as number) < 1)
  ) {
    throw new RecommendationJobError("INVALID_JOB_PARAMETERS", 500, "Job parameters are invalid.");
  }
  return {
    kNeighbors: kNeighbors as number,
    topN: topN as number,
    minCommonRatings: minCommonRatings as number,
    similarityStrategy,
    activeFoodIds: activeFoodIds as number[]
  };
}

async function verifySnapshot(dataset: { filePath: string; fileChecksum: string; rowCount: number }) {
  let buffer: Buffer;
  try {
    buffer = await readRatingExport(dataset.filePath);
  } catch {
    throw new RecommendationJobError("SNAPSHOT_UNAVAILABLE", 409, "Rating snapshot is unavailable.");
  }
  if (buffer.byteLength > MAX_JOB_SNAPSHOT_BYTES) {
    throw new RecommendationJobError("SNAPSHOT_TOO_LARGE", 413, "Rating snapshot exceeds worker size limit.");
  }
  if (digest(buffer) !== dataset.fileChecksum) {
    throw new RecommendationJobError("SNAPSHOT_CHECKSUM_MISMATCH", 409, "Rating snapshot checksum does not match metadata.");
  }
  const parsed = parseRatingSnapshotCsv(buffer, dataset.rowCount);
  if (parsed.errors.length) {
    throw new RecommendationJobError("SNAPSHOT_INVALID", 409, "Rating snapshot content is invalid.");
  }
  return { buffer, ratings: parsed.rows };
}

function safeErrorSummary(code: string) {
  const summaries: Record<string, string> = {
    ENGINE_ERROR: "Worker computation failed.",
    SNAPSHOT_CHECKSUM_MISMATCH: "Rating snapshot checksum verification failed.",
    SNAPSHOT_INVALID: "Rating snapshot content validation failed.",
    SNAPSHOT_UNAVAILABLE: "Rating snapshot is unavailable.",
    TIMEOUT: "Worker attempt timed out.",
    WORKER_ERROR: "Worker reported a processing failure."
  };
  return summaries[code] ?? summaries.WORKER_ERROR!;
}

function retryAt(attemptCount: number, now: Date) {
  return new Date(now.getTime() + Math.min(5_000 * (2 ** Math.max(0, attemptCount - 1)), 5 * 60_000));
}

export async function createRecommendationJob(input: {
  datasetExportId: number;
  createdByAdminId: number;
  idempotencyKey: string;
  kNeighbors: number;
  topN: number;
}) {
  const prior = await prisma.recommendationJob.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (prior) {
    if (
      prior.datasetExportId !== input.datasetExportId || prior.createdByAdminId !== input.createdByAdminId ||
      prior.engineVersion !== RECOMMENDATION_ENGINE_VERSION ||
      !sameRequestedParameters(prior.parameters, input.kNeighbors, input.topN)
    ) {
      throw new RecommendationJobError("IDEMPOTENCY_KEY_REUSED", 409, "Idempotency key was already used for a different request.");
    }
    return { job: prior, created: false };
  }

  const dataset = await prisma.datasetExport.findUnique({ where: { id: input.datasetExportId } });
  if (!dataset) throw new RecommendationJobError("DATASET_NOT_FOUND", 404, "Rating snapshot not found.");
  await verifySnapshot(dataset);
  const activeFoods = await prisma.food.findMany({ where: { isActive: true }, orderBy: { id: "asc" }, take: MAX_ACTIVE_FOODS + 1, select: { id: true } });
  if (activeFoods.length > MAX_ACTIVE_FOODS) {
    throw new RecommendationJobError("ACTIVE_FOOD_LIMIT", 422, "Active food catalog exceeds worker limit.");
  }

  const parameters: JobParameters = {
    kNeighbors: input.kNeighbors,
    topN: input.topN,
    minCommonRatings: 1,
    similarityStrategy: "overlap",
    activeFoodIds: activeFoods.map(({ id }) => id)
  };
  try {
    const job = await prisma.recommendationJob.create({
      data: {
        datasetExportId: input.datasetExportId,
        createdByAdminId: input.createdByAdminId,
        trigger: "MANUAL_ADMIN",
        idempotencyKey: input.idempotencyKey,
        engineVersion: RECOMMENDATION_ENGINE_VERSION,
        parameters: parameters as unknown as Prisma.InputJsonValue,
        maxAttempts: MAX_JOB_ATTEMPTS,
        timeoutSeconds: JOB_TIMEOUT_SECONDS
      }
    });
    return { job, created: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await prisma.recommendationJob.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (duplicate) {
        if (
          duplicate.datasetExportId === input.datasetExportId && duplicate.createdByAdminId === input.createdByAdminId &&
          duplicate.engineVersion === RECOMMENDATION_ENGINE_VERSION &&
          sameRequestedParameters(duplicate.parameters, input.kNeighbors, input.topN)
        ) return { job: duplicate, created: false };
        throw new RecommendationJobError("IDEMPOTENCY_KEY_REUSED", 409, "Idempotency key was already used for a different request.");
      }
    }
    throw error;
  }
}

function sameRequestedParameters(value: Prisma.JsonValue, kNeighbors: number, topN: number) {
  try {
    const parameters = parametersFrom(value);
    return parameters.kNeighbors === kNeighbors && parameters.topN === topN;
  } catch {
    return false;
  }
}

type ClaimedJobRow = {
  id: string;
  datasetExportId: number;
  datasetChecksum: string;
  datasetRowCount: number;
  engineVersion: string;
  parameters: Prisma.JsonValue;
  attemptCount: number;
  maxAttempts: number;
  timeoutSeconds: number;
  leaseToken: string;
  leaseExpiresAt: Date;
  timeoutAt: Date;
};

export async function claimRecommendationJob(workerId: string) {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    await tx.$executeRaw(Prisma.sql`
      UPDATE "RecommendationJob"
      SET "status" = 'FAILED', "finishedAt" = ${now}, "leaseExpiresAt" = NULL, "timeoutAt" = NULL,
          "errorSummary" = 'Retry limit reached after worker timeout or lease expiry.'
      WHERE "attemptCount" >= "maxAttempts" AND (
        ("status" = 'RUNNING' AND ("leaseExpiresAt" <= ${now} OR "timeoutAt" <= ${now})) OR
        ("status" = 'PENDING' AND "nextAttemptAt" <= ${now})
      )
    `);

    const leaseToken = randomUUID();
    const claimed = await tx.$queryRaw<ClaimedJobRow[]>(Prisma.sql`
      WITH candidate AS (
        SELECT job."id"
        FROM "RecommendationJob" AS job
        WHERE (
          job."status" = 'PENDING' AND job."attemptCount" < job."maxAttempts" AND job."nextAttemptAt" <= ${now}
        ) OR (
          job."status" = 'RUNNING' AND job."attemptCount" < job."maxAttempts" AND
          (job."leaseExpiresAt" <= ${now} OR job."timeoutAt" <= ${now})
        )
        ORDER BY job."createdAt" ASC, job."id" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "RecommendationJob" AS job
      SET "status" = 'RUNNING',
          "attemptCount" = job."attemptCount" + 1,
          "leaseToken" = ${leaseToken}::uuid,
          "leaseExpiresAt" = ${new Date(now.getTime() + JOB_LEASE_SECONDS * 1000)},
          "timeoutAt" = ${new Date(now.getTime() + JOB_TIMEOUT_SECONDS * 1000)},
          "workerId" = ${workerId},
          "heartbeatAt" = ${now},
          "startedAt" = COALESCE(job."startedAt", ${now}),
          "finishedAt" = NULL,
          "errorSummary" = CASE
            WHEN job."status" = 'RUNNING' AND job."timeoutAt" <= ${now} THEN 'Worker attempt timed out; reclaimed.'
            WHEN job."status" = 'RUNNING' THEN 'Worker lease expired; reclaimed.'
            ELSE job."errorSummary"
          END
      FROM candidate, "DatasetExport" AS dataset
      WHERE job."id" = candidate."id" AND dataset."id" = job."datasetExportId"
      RETURNING job."id", job."datasetExportId", dataset."fileChecksum" AS "datasetChecksum",
                dataset."rowCount" AS "datasetRowCount",
                job."engineVersion", job."parameters", job."attemptCount", job."maxAttempts",
                job."timeoutSeconds", job."leaseToken", job."leaseExpiresAt", job."timeoutAt"
    `);
    const job = claimed[0];
    if (!job) return null;
    return { ...job, parameters: parametersFrom(job.parameters), leaseDurationSeconds: JOB_LEASE_SECONDS };
  });
}

async function findJobForWorker(jobId: string, workerId: string, leaseToken: string) {
  const job = await prisma.recommendationJob.findUnique({
    where: { id: jobId },
    include: { datasetExport: true, artifact: true }
  });
  if (!job) throw new RecommendationJobError("JOB_NOT_FOUND", 404, "Recommendation job not found.");
  if (job.workerId !== workerId || job.leaseToken !== leaseToken) {
    throw new RecommendationJobError("LEASE_NOT_OWNED", 409, "Worker does not own this job lease.");
  }
  return job;
}

function requireActiveLease(job: { status: RecommendationJobStatus; leaseExpiresAt: Date | null; timeoutAt: Date | null }, now: Date) {
  if (job.status !== "RUNNING" || !job.leaseExpiresAt || job.leaseExpiresAt <= now || !job.timeoutAt || job.timeoutAt <= now) {
    throw new RecommendationJobError("LEASE_EXPIRED", 409, "Job lease is no longer active.");
  }
}

export async function getRecommendationJobSnapshot(jobId: string, workerId: string, leaseToken: string) {
  const job = await findJobForWorker(jobId, workerId, leaseToken);
  requireActiveLease(job, new Date());
  const { buffer } = await verifySnapshot(job.datasetExport);
  return { buffer, checksum: job.datasetExport.fileChecksum, filename: job.datasetExport.filename };
}

export async function heartbeatRecommendationJob(jobId: string, workerId: string, leaseToken: string) {
  const job = await findJobForWorker(jobId, workerId, leaseToken);
  const now = new Date();
  requireActiveLease(job, now);
  const leaseExpiresAt = new Date(Math.min(now.getTime() + JOB_LEASE_SECONDS * 1000, job.timeoutAt!.getTime()));
  const updated = await prisma.recommendationJob.updateMany({
    where: {
      id: jobId,
      status: "RUNNING",
      workerId,
      leaseToken,
      leaseExpiresAt: { gt: now },
      timeoutAt: { gt: now }
    },
    data: { heartbeatAt: now, leaseExpiresAt }
  });
  if (updated.count !== 1) throw new RecommendationJobError("LEASE_LOST", 409, "Job lease is no longer active.");
  return { heartbeatAt: now, leaseExpiresAt };
}

function validateRecommendations(
  recommendations: JobRecommendation[],
  parameters: JobParameters,
  sourceRatings: { userId: number; foodId: number; rating: number }[]
) {
  if (recommendations.length > MAX_JOB_RESULT_ROWS) {
    throw new RecommendationJobError("RESULT_TOO_LARGE", 413, "Worker result exceeds row limit.");
  }
  const usersWithRatings = new Set(sourceRatings.map(({ userId }) => userId));
  const ratedPairs = new Set(sourceRatings.map(({ userId, foodId }) => `${userId}:${foodId}`));
  const activeFoods = new Set(parameters.activeFoodIds);
  const keys = new Set<string>();
  const ranksByUser = new Map<number, Set<number>>();
  for (const item of recommendations) {
    if (
      !usersWithRatings.has(item.userId) || !activeFoods.has(item.foodId) ||
      ratedPairs.has(`${item.userId}:${item.foodId}`) || item.rank > parameters.topN ||
      item.predictedRating < 1 || item.predictedRating > 5
    ) throw new RecommendationJobError("RESULT_INVALID", 422, "Worker result violates snapshot or parameter constraints.");
    const pair = `${item.userId}:${item.foodId}`;
    if (keys.has(pair)) throw new RecommendationJobError("RESULT_DUPLICATE", 422, "Worker result contains duplicate user-food rows.");
    keys.add(pair);
    const ranks = ranksByUser.get(item.userId) ?? new Set<number>();
    if (ranks.has(item.rank)) throw new RecommendationJobError("RESULT_DUPLICATE", 422, "Worker result contains duplicate ranks.");
    ranks.add(item.rank);
    ranksByUser.set(item.userId, ranks);
  }
  for (const ranks of ranksByUser.values()) {
    const ordered = [...ranks].sort((left, right) => left - right);
    if (ordered.some((rank, index) => rank !== index + 1)) {
      throw new RecommendationJobError("RESULT_INVALID", 422, "Worker result ranks must be contiguous from one.");
    }
  }
}

function recommendationPayload(recommendations: JobRecommendation[]) {
  return recommendations.map(({ userId, foodId, rank, predictedRating }) => ({ userId, foodId, rank, predictedRating }));
}

export async function submitRecommendationJobResult(
  jobId: string,
  workerId: string,
  leaseToken: string,
  recommendations: JobRecommendation[]
) {
  const snapshotJob = await findJobForWorker(jobId, workerId, leaseToken);
  const parameters = parametersFrom(snapshotJob.parameters);
  const normalized = recommendationPayload(recommendations);
  const serialized = JSON.stringify({ recommendations: normalized });
  if (Buffer.byteLength(serialized, "utf8") > MAX_JOB_RESULT_BYTES) {
    throw new RecommendationJobError("RESULT_TOO_LARGE", 413, "Worker result exceeds byte limit.");
  }
  const checksum = digest(serialized);

  if (snapshotJob.status === "SUCCEEDED") {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "RecommendationJob" WHERE "id" = ${jobId}::uuid FOR UPDATE`);
      const job = await tx.recommendationJob.findUnique({ where: { id: jobId }, include: { artifact: true } });
      if (!job) throw new RecommendationJobError("JOB_NOT_FOUND", 404, "Recommendation job not found.");
      if (job.workerId !== workerId || job.leaseToken !== leaseToken) {
        throw new RecommendationJobError("LEASE_NOT_OWNED", 409, "Worker does not own this job lease.");
      }
      if (job.status !== "SUCCEEDED" || job.artifact?.checksum !== checksum) {
        throw new RecommendationJobError("RESULT_ALREADY_EXISTS", 409, "Job already has a different result artifact.");
      }
      return { status: job.status, artifactId: job.artifact.id, checksum, rowCount: job.artifact.rowCount, verificationStatus: "UNVERIFIED", idempotent: true };
    });
  }

  const { ratings } = await verifySnapshot(snapshotJob.datasetExport);
  validateRecommendations(recommendations, parameters, ratings);

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "RecommendationJob" WHERE "id" = ${jobId}::uuid FOR UPDATE`);
    const job = await tx.recommendationJob.findUnique({ where: { id: jobId }, include: { artifact: true } });
    if (!job) throw new RecommendationJobError("JOB_NOT_FOUND", 404, "Recommendation job not found.");
    if (job.workerId !== workerId || job.leaseToken !== leaseToken) {
      throw new RecommendationJobError("LEASE_NOT_OWNED", 409, "Worker does not own this job lease.");
    }
    if (job.status === "SUCCEEDED" && job.artifact?.checksum === checksum) {
      return { status: job.status, artifactId: job.artifact.id, checksum, rowCount: job.artifact.rowCount, verificationStatus: "UNVERIFIED", idempotent: true };
    }
    if (job.status === "SUCCEEDED") {
      throw new RecommendationJobError("RESULT_ALREADY_EXISTS", 409, "Job already has a different result artifact.");
    }
    const now = new Date();
    requireActiveLease(job, now);
    if (job.artifact) throw new RecommendationJobError("RESULT_ALREADY_EXISTS", 409, "Job already has a result artifact.");
    const artifact = await tx.recommendationJobArtifact.create({
      data: {
        jobId,
        verificationStatus: "UNVERIFIED",
        checksum,
        rowCount: normalized.length,
        payload: { recommendations: normalized } as unknown as Prisma.InputJsonValue
      }
    });
    await tx.recommendationJob.update({
      where: { id: jobId },
      data: { status: "SUCCEEDED", finishedAt: now, leaseExpiresAt: null, timeoutAt: null, errorSummary: null }
    });
    return { status: "SUCCEEDED" as const, artifactId: artifact.id, checksum, rowCount: artifact.rowCount, verificationStatus: "UNVERIFIED", idempotent: false };
  });
}

export async function failRecommendationJob(jobId: string, workerId: string, leaseToken: string, code: string) {
  const summary = safeErrorSummary(code);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "RecommendationJob" WHERE "id" = ${jobId}::uuid FOR UPDATE`);
    const job = await tx.recommendationJob.findUnique({ where: { id: jobId } });
    if (!job) throw new RecommendationJobError("JOB_NOT_FOUND", 404, "Recommendation job not found.");
    if (job.workerId !== workerId || job.leaseToken !== leaseToken) {
      throw new RecommendationJobError("LEASE_NOT_OWNED", 409, "Worker does not own this job lease.");
    }
    if ((job.status === "PENDING" || job.status === "FAILED") && job.errorSummary === summary) {
      return { status: job.status, attemptCount: job.attemptCount, nextAttemptAt: job.nextAttemptAt, errorSummary: summary, idempotent: true };
    }
    const now = new Date();
    const timeoutReport = code === "TIMEOUT" && job.status === "RUNNING" && Boolean(job.timeoutAt && job.timeoutAt <= now);
    if (job.status !== "RUNNING" || (!timeoutReport && (!job.leaseExpiresAt || job.leaseExpiresAt <= now || !job.timeoutAt || job.timeoutAt <= now))) {
      throw new RecommendationJobError("LEASE_EXPIRED", 409, "Job lease is no longer active.");
    }
    const failed = job.attemptCount >= job.maxAttempts;
    const nextAttemptAt = failed ? now : retryAt(job.attemptCount, now);
    const status: RecommendationJobStatus = failed ? "FAILED" : "PENDING";
    await tx.recommendationJob.update({
      where: { id: jobId },
      data: {
        status,
        nextAttemptAt,
        finishedAt: failed ? now : null,
        leaseExpiresAt: null,
        timeoutAt: null,
        errorSummary: summary
      }
    });
    return { status, attemptCount: job.attemptCount, nextAttemptAt, errorSummary: summary, idempotent: false };
  });
}

export async function getRecommendationJobStatus(jobId: string, workerId: string, leaseToken: string) {
  const job = await findJobForWorker(jobId, workerId, leaseToken);
  return {
    id: job.id,
    status: job.status,
    attemptCount: job.attemptCount,
    maxAttempts: job.maxAttempts,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    heartbeatAt: job.heartbeatAt,
    leaseExpiresAt: job.leaseExpiresAt,
    errorSummary: job.errorSummary,
    artifact: job.artifact ? {
      id: job.artifact.id,
      checksum: job.artifact.checksum,
      rowCount: job.artifact.rowCount,
      verificationStatus: job.artifact.verificationStatus,
      createdAt: job.artifact.createdAt
    } : null
  };
}

export async function cancelRecommendationJob(jobId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "RecommendationJob" WHERE "id" = ${jobId}::uuid FOR UPDATE`);
    const job = await tx.recommendationJob.findUnique({ where: { id: jobId } });
    if (!job) throw new RecommendationJobError("JOB_NOT_FOUND", 404, "Recommendation job not found.");
    if (job.status === "CANCELLED") return { id: job.id, status: job.status, finishedAt: job.finishedAt, idempotent: true };
    if (job.status !== "PENDING" && job.status !== "RUNNING") {
      throw new RecommendationJobError("JOB_TERMINAL", 409, "Completed job cannot be cancelled.");
    }
    const updated = await tx.recommendationJob.update({
      where: { id: jobId },
      data: {
        status: "CANCELLED",
        finishedAt: new Date(),
        leaseExpiresAt: null,
        timeoutAt: null,
        errorSummary: "Cancelled by administrator."
      }
    });
    return { id: updated.id, status: updated.status, finishedAt: updated.finishedAt, idempotent: false };
  });
}
