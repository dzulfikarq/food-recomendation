import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { removeRatingExport } from "@/lib/food/storage";
import { createRatingDatasetExportInTransaction } from "@/lib/food/rating-export";

const MAX_ACTIVE_FOODS = 10_000;
const MAX_JOB_ATTEMPTS = 3;
const JOB_TIMEOUT_SECONDS = 15 * 60;
const WORKER_HEARTBEAT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

type ScheduleResult = {
  checked: boolean;
  scheduled: boolean;
  reason: string;
  jobId: string | null;
  nextCheckAt: Date;
  retryAfterSeconds: number;
  datasetDirty: boolean;
};

function result(
  now: Date,
  nextCheckAt: Date,
  input: Omit<ScheduleResult, "nextCheckAt" | "retryAfterSeconds">
): ScheduleResult {
  return {
    ...input,
    nextCheckAt,
    retryAfterSeconds: Math.max(1, Math.ceil((nextCheckAt.getTime() - now.getTime()) / 1000))
  };
}

export function automaticJobDedupeKey(input: {
  ratingRevision: bigint;
  engineVersion: string;
  parameters: Prisma.InputJsonValue;
}) {
  return createHash("sha256")
    .update(JSON.stringify({ ratingRevision: input.ratingRevision.toString(), engineVersion: input.engineVersion, parameters: input.parameters }))
    .digest("hex");
}

export async function runRecommendationScheduler(workerId: string, workerEngineVersion: string) {
  let stagedSnapshotKey: string | undefined;
  try {
    return await prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.recommendationWorker.upsert({
        where: { workerId },
        create: { workerId, engineVersion: workerEngineVersion, lastSeenAt: now },
        update: { engineVersion: workerEngineVersion, lastSeenAt: now }
      });
      await tx.recommendationWorker.deleteMany({
        where: { lastSeenAt: { lt: new Date(now.getTime() - WORKER_HEARTBEAT_RETENTION_MS) } }
      });

      const initialConfig = await tx.recommendationEngineConfig.findUniqueOrThrow({ where: { id: 1 } });
      const observedState = await tx.ratingDatasetState.findUniqueOrThrow({ where: { id: 1 } });
      if (initialConfig.nextScheduleAt > now) {
        return result(now, initialConfig.nextScheduleAt, {
          checked: false,
          scheduled: false,
          reason: "NOT_DUE",
          jobId: null,
          datasetDirty: observedState.currentRevision > observedState.processedRevision
        });
      }

      const states = await tx.$queryRaw<Array<{ currentRevision: bigint; processedRevision: bigint }>>`
        SELECT "currentRevision", "processedRevision" FROM "RatingDatasetState" WHERE "id" = 1 FOR UPDATE
      `;
      const state = states[0];
      if (!state) throw new Error("Rating dataset state is missing.");
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "RecommendationEngineConfig" WHERE "id" = 1 FOR UPDATE`);
      const config = await tx.recommendationEngineConfig.findUniqueOrThrow({ where: { id: 1 } });
      if (config.nextScheduleAt > now) {
        return result(now, config.nextScheduleAt, {
          checked: false,
          scheduled: false,
          reason: "NOT_DUE",
          jobId: null,
          datasetDirty: state.currentRevision > state.processedRevision
        });
      }

      const nextCheckAt = new Date(now.getTime() + config.scheduleIntervalMinutes * 60_000);
      const datasetDirty = state.currentRevision > state.processedRevision;
      let reason = "DATASET_CLEAN";
      let jobId: string | null = null;
      let scheduled = false;

      if (datasetDirty && workerEngineVersion !== config.engineVersion) {
        reason = "ENGINE_VERSION_UNSUPPORTED";
      } else if (datasetDirty && (!config.autoProcessingEnabled || config.validationStatus !== "VALIDATED")) {
        reason = "VALIDATION_GATE_CLOSED";
      } else if (datasetDirty) {
        const administrator = await tx.user.findFirst({ where: { role: "ADMIN" }, orderBy: { id: "asc" }, select: { id: true } });
        if (!administrator) {
          reason = "ADMINISTRATOR_UNAVAILABLE";
        } else {
          const activeFoods = await tx.food.findMany({
            where: { isActive: true },
            orderBy: { id: "asc" },
            take: MAX_ACTIVE_FOODS + 1,
            select: { id: true }
          });
          if (activeFoods.length > MAX_ACTIVE_FOODS) {
            reason = "ACTIVE_FOOD_LIMIT";
          } else {
            const parameters = {
              kNeighbors: config.kNeighbors,
              topN: config.topN,
              minCommonRatings: 1,
              similarityStrategy: "overlap",
              activeFoodIds: activeFoods.map(({ id }) => id)
            };
            const automaticDedupeKey = automaticJobDedupeKey({
              ratingRevision: state.currentRevision,
              engineVersion: config.engineVersion,
              parameters
            });
            const existing = await tx.recommendationJob.findUnique({ where: { automaticDedupeKey: automaticDedupeKey } });
            if (existing) {
              reason = "IDENTICAL_JOB_EXISTS";
              jobId = existing.id;
            } else {
              const snapshot = await createRatingDatasetExportInTransaction(tx, administrator.id);
              stagedSnapshotKey = snapshot.stagingKey;
              const job = await tx.recommendationJob.create({
                data: {
                  datasetExportId: snapshot.record.id,
                  createdByAdminId: administrator.id,
                  trigger: "AUTO_RATING_CHANGE",
                  idempotencyKey: randomUUID(),
                  automaticDedupeKey,
                  engineVersion: config.engineVersion,
                  parameters: parameters as unknown as Prisma.InputJsonValue,
                  maxAttempts: MAX_JOB_ATTEMPTS,
                  timeoutSeconds: JOB_TIMEOUT_SECONDS
                },
                select: { id: true }
              });
              reason = "JOB_ENQUEUED";
              jobId = job.id;
              scheduled = true;
            }
          }
        }
      }

      await tx.recommendationEngineConfig.update({
        where: { id: 1 },
        data: { schedulerLastCheckedAt: now, nextScheduleAt: nextCheckAt, lastSchedulerReason: reason }
      });
      return result(now, nextCheckAt, { checked: true, scheduled, reason, jobId, datasetDirty });
    });
  } catch (error) {
    if (stagedSnapshotKey) await removeRatingExport(stagedSnapshotKey).catch(() => undefined);
    throw error;
  }
}
