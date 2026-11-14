import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { createRatingDatasetExportInTransaction } from "@/lib/food/rating-export";
import { removeRatingExport, removeRecommendationImport, saveRecommendationImport } from "@/lib/food/storage";
import { prisma } from "@/lib/prisma";
import { prepareTestPrototypeBatch, RecommendationArtifactPromotionError } from "@/lib/recommendations/artifact-promotion";
import { MAX_JOB_RESULT_ROWS, recommendationJobParameters, verifyRecommendationSnapshot, RECOMMENDATION_ENGINE_VERSION } from "@/lib/recommendations/jobs";
import { automaticJobDedupeKey } from "@/lib/recommendations/scheduler";

export function testPrototypeAutomationEnabled() {
  if (
    process.env.FOODREC_TEST_RUN !== "e2e" || process.env.FOODREC_TEST_AUTO_RECOMMENDATIONS !== "1" ||
    !process.env.FOODREC_E2E_RUN_ID || !process.env.DATABASE_URL || !process.env.FOODREC_E2E_DATABASE_URL ||
    !process.env.FOODREC_ORIGINAL_DATABASE_URL
  ) return false;
  try {
    const current = new URL(process.env.DATABASE_URL);
    const test = new URL(process.env.FOODREC_E2E_DATABASE_URL);
    const source = new URL(process.env.FOODREC_ORIGINAL_DATABASE_URL);
    const sameTarget = (left: URL, right: URL) =>
      left.protocol === right.protocol && left.hostname === right.hostname && left.port === right.port &&
      left.username === right.username && left.password === right.password && left.pathname === right.pathname;
    const databaseName = decodeURIComponent(test.pathname.slice(1));
    const localHost = ["localhost", "127.0.0.1", "[::1]"].includes(test.hostname);
    const validRunId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(process.env.FOODREC_E2E_RUN_ID);
    return localHost && validRunId && databaseName.endsWith("_test") && sameTarget(current, test) && !sameTarget(test, source);
  } catch {
    return false;
  }
}

export async function enqueueTestPrototypeRecommendationJob() {
  if (!testPrototypeAutomationEnabled()) throw new Error("TEST_PROTOTYPE_DISABLED");
  let snapshotKey: string | undefined;
  try {
    return await prisma.$transaction(async (tx) => {
      const states = await tx.$queryRaw<Array<{ currentRevision: bigint }>>`
        SELECT "currentRevision" FROM "RatingDatasetState" WHERE "id" = 1 FOR UPDATE
      `;
      const state = states[0];
      if (!state) throw new Error("RATING_DATASET_STATE_MISSING");
      const config = await tx.recommendationEngineConfig.findUniqueOrThrow({ where: { id: 1 } });
      if (config.autoProcessingEnabled || config.automaticPublicationEnabled || config.engineVersion !== RECOMMENDATION_ENGINE_VERSION) {
        throw new Error("TEST_PROTOTYPE_GATES_INVALID");
      }
      const administrator = await tx.user.findFirst({ where: { role: "ADMIN" }, orderBy: { id: "asc" }, select: { id: true } });
      if (!administrator) throw new Error("ADMINISTRATOR_UNAVAILABLE");

      const activeFoodIds = await activePrototypeFoodIds(tx);
      const targetUsers = await tx.$queryRaw<Array<{ userId: number }>>`
        SELECT DISTINCT rating."userId"
        FROM "Rating" AS rating JOIN "User" AS account ON account."id" = rating."userId"
        WHERE account."role" = 'USER' ORDER BY rating."userId" ASC
      `;
      if (!targetUsers.length) return { jobId: null, reason: "NO_TARGET_USERS" as const };
      const maxTargetUsers = Math.floor(MAX_JOB_RESULT_ROWS / config.topN);
      if (targetUsers.length > maxTargetUsers) throw new Error("TARGET_USER_LIMIT");

      const parameters = {
        kNeighbors: config.kNeighbors,
        topN: config.topN,
        minCommonRatings: 1,
        similarityStrategy: "overlap",
        activeFoodIds,
        targetUserIds: targetUsers.map(({ userId }) => userId)
      };
      const dedupeKey = automaticJobDedupeKey({
        ratingRevision: state.currentRevision,
        engineVersion: config.engineVersion,
        parameters: parameters as unknown as Prisma.InputJsonValue
      });
      const existing = await tx.recommendationJob.findUnique({ where: { automaticDedupeKey: dedupeKey }, select: { id: true } });
      if (existing) return { jobId: existing.id, reason: "IDENTICAL_JOB_EXISTS" as const };

      const snapshot = await createRatingDatasetExportInTransaction(tx, administrator.id);
      snapshotKey = snapshot.stagingKey;
      const job = await tx.recommendationJob.create({
        data: {
          datasetExportId: snapshot.record.id,
          createdByAdminId: administrator.id,
          trigger: "TEST_PROTOTYPE",
          idempotencyKey: randomUUID(),
          automaticDedupeKey: dedupeKey,
          engineVersion: config.engineVersion,
          parameters: parameters as unknown as Prisma.InputJsonValue
        },
        select: { id: true }
      });
      return { jobId: job.id, reason: "JOB_ENQUEUED" as const };
    });
  } catch (error) {
    if (snapshotKey) await removeRatingExport(snapshotKey).catch(() => undefined);
    throw error;
  }
}

export async function verifyAndPublishTestPrototypeArtifact(jobId: string) {
  if (!testPrototypeAutomationEnabled()) throw new RecommendationArtifactPromotionError("TEST_PROTOTYPE_DISABLED");
  let storedCsvKey: string | undefined;
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "RecommendationJob" WHERE "id" = ${jobId}::uuid FOR UPDATE`);
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(7402193841::bigint)`;
      const jobs = await tx.recommendationJob.findUnique({ where: { id: jobId }, include: { artifact: true, datasetExport: true } });
      if (!jobs || jobs.trigger !== "TEST_PROTOTYPE" || !jobs.artifact) {
        throw new RecommendationArtifactPromotionError("TEST_PROTOTYPE_ARTIFACT_NOT_FOUND");
      }
      const filename = `python-${jobId}.csv`;
      const previous = await tx.recommendationBatch.findFirst({ where: { filename } });
      if (previous) {
        const report = previous.validationReport;
        const verification = report && typeof report === "object" && !Array.isArray(report) ? report.artifactVerification : null;
        if (verification && typeof verification === "object" && !Array.isArray(verification) && verification.artifactId === jobs.artifact.id) {
          return { status: "ALREADY_PUBLISHED" as const, batchId: previous.id };
        }
        throw new RecommendationArtifactPromotionError("BATCH_IDEMPOTENCY_CONFLICT");
      }

      const states = await tx.$queryRaw<Array<{ currentRevision: bigint }>>`
        SELECT "currentRevision" FROM "RatingDatasetState" WHERE "id" = 1 FOR UPDATE
      `;
      const state = states[0];
      if (!state) throw new RecommendationArtifactPromotionError("RATING_DATASET_STATE_MISSING");
      const config = await tx.recommendationEngineConfig.findUniqueOrThrow({ where: { id: 1 } });
      const { ratings } = await verifyRecommendationSnapshot(jobs.datasetExport);
      const parameters = recommendationJobParameters(jobs.parameters);
      const activeFoodIds = await activePrototypeFoodIds(tx);
      const currentTargets = await tx.$queryRaw<Array<{ userId: number }>>`
        SELECT DISTINCT rating."userId"
        FROM "Rating" AS rating JOIN "User" AS account ON account."id" = rating."userId"
        WHERE account."role" = 'USER' ORDER BY rating."userId" ASC
      `;
      const prepared = prepareTestPrototypeBatch({
        job: jobs,
        createdByAdminId: jobs.createdByAdminId,
        dataset: jobs.datasetExport,
        currentRatingRevision: state.currentRevision,
        artifact: jobs.artifact,
        config,
        parameters: {
          ...parameters,
          targetUserIds: parameters.targetUserIds ?? []
        },
        currentActiveFoodIds: activeFoodIds,
        currentTargetUserIds: currentTargets.map(({ userId }) => userId),
        sourceRatings: ratings
      });

      storedCsvKey = await saveRecommendationImport(prepared.csv);
      await tx.recommendationBatch.updateMany({ where: { status: "PUBLISHED" }, data: { status: "SUPERSEDED" } });
      const now = new Date();
      const batch = await tx.recommendationBatch.create({
        data: {
          ...prepared.batch,
          filename,
          filePath: storedCsvKey,
          publishedAt: now,
          publishedById: jobs.createdByAdminId,
          validationReport: prepared.report as unknown as Prisma.InputJsonValue
        }
      });
      if (prepared.rows.length) {
        await tx.recommendation.createMany({
          data: prepared.rows.map(({ userId, foodId, rank }) => ({ batchId: batch.id, userId, foodId, rank }))
        });
      }
      return { status: "PUBLISHED" as const, batchId: batch.id, rowCount: prepared.rows.length };
    });
  } catch (error) {
    if (storedCsvKey) await removeRecommendationImport(storedCsvKey).catch(() => undefined);
    throw error;
  }
}

export async function publishTestPrototypeArtifactIfQueued(jobId: string) {
  if (!testPrototypeAutomationEnabled()) return null;
  const job = await prisma.recommendationJob.findUnique({ where: { id: jobId }, select: { trigger: true } });
  if (job?.trigger !== "TEST_PROTOTYPE") return null;
  return verifyAndPublishTestPrototypeArtifact(jobId);
}

async function activePrototypeFoodIds(db: typeof prisma | Prisma.TransactionClient) {
  const activeCatalog = await db.foodCatalogImport.findFirst({ where: { sourceDataset: "FOODCOM", isActive: true }, select: { id: true } });
  const foods = await db.food.findMany({
    where: activeCatalog ? { isActive: true, sourceDataset: "FOODCOM", sourceImportId: activeCatalog.id } : { isActive: true },
    orderBy: { id: "asc" },
    take: 10_001,
    select: { id: true }
  });
  if (foods.length > 10_000) throw new Error("ACTIVE_FOOD_LIMIT");
  return foods.map(({ id }) => id);
}
