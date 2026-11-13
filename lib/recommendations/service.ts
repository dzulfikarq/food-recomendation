import { createHash } from "node:crypto";
import path from "node:path";
import { Prisma, type RecommendationBatchStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { readRatingExport, readRecommendationImport, removeRecommendationImport, saveRecommendationImport } from "@/lib/food/storage";
import { RECOMMENDATION_PREVIEW_SIZE } from "@/lib/recommendations/constants";
import { parseRatingSnapshotCsv, parseRecommendationCsv, type ParsedRecommendationRow, type RecommendationCsvError } from "@/lib/recommendations/csv";
import type { RecommendationPreviewRow, RecommendationValidationReport } from "@/lib/recommendations/types";

type Database = Prisma.TransactionClient;

export class RecommendationDatasetError extends Error {}

function checksum(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function safeRecommendationFilename(name: string) {
  const filename = [...path.posix.basename(name.replaceAll("\\", "/"))]
    .filter((character) => character.charCodeAt(0) >= 32 && !(character.charCodeAt(0) >= 127 && character.charCodeAt(0) <= 159))
    .join("")
    .trim()
    .slice(0, 255);
  return filename || "recommendations.csv";
}

async function loadSourceDataset(db: Database, datasetExportId: number) {
  const dataset = await db.datasetExport.findUnique({ where: { id: datasetExportId } });
  if (!dataset) throw new RecommendationDatasetError("DATASET_NOT_FOUND");

  let buffer: Buffer;
  try {
    buffer = await readRatingExport(dataset.filePath);
  } catch {
    throw new RecommendationDatasetError("DATASET_FILE_UNAVAILABLE");
  }
  if (checksum(buffer) !== dataset.fileChecksum) throw new RecommendationDatasetError("DATASET_CHECKSUM_MISMATCH");
  const parsed = parseRatingSnapshotCsv(buffer, dataset.rowCount);
  if (parsed.errors.length) throw new RecommendationDatasetError("DATASET_CONTENT_INVALID");
  return { dataset, ratings: parsed.rows };
}

function reportLineErrors(errors: RecommendationCsvError[]) {
  return new Set(errors.filter(({ row }) => row > 0).map(({ row }) => row));
}

async function evaluateRecommendations(
  db: Database,
  input: { datasetExportId: number; kNeighbors: number; topN: number; filename: string },
  sourceRatings: Awaited<ReturnType<typeof loadSourceDataset>>["ratings"],
  sourceDataset: Awaited<ReturnType<typeof loadSourceDataset>>["dataset"],
  parsed: ReturnType<typeof parseRecommendationCsv>
) {
  const errors = [...parsed.errors];
  const userIds = [...new Set(parsed.rows.map(({ userId }) => userId))];
  const foodIds = [...new Set(parsed.rows.map(({ itemId }) => itemId))];
  const [users, foods, currentRatings] = await Promise.all([
    db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
    db.food.findMany({ where: { id: { in: foodIds } }, select: { id: true, name: true, category: true, imageUrl: true, isActive: true } }),
    db.rating.findMany({ select: { userId: true, foodId: true, rating: true } })
  ]);
  const usersById = new Map(users.map((user) => [user.id, user]));
  const foodsById = new Map(foods.map((food) => [food.id, food]));
  // Negative IDs are imported Food.com neighbors, not current USER rating revisions.
  const accountSourceRatings = sourceRatings.filter(({ userId }) => userId > 0);
  const sourceUsers = new Set(accountSourceRatings.map(({ userId }) => userId));
  const sourcePairs = new Set(sourceRatings.map(({ userId, foodId }) => `${userId}:${foodId}`));
  const sourceValues = new Map(accountSourceRatings.map(({ userId, foodId, rating }) => [`${userId}:${foodId}`, rating]));
  const currentValues = new Map(currentRatings.map(({ userId, foodId, rating }) => [`${userId}:${foodId}`, rating]));
  let ratingsAdded = 0;
  let ratingsChanged = 0;
  let ratingsRemoved = 0;
  for (const [key, rating] of currentValues) {
    if (!sourceValues.has(key)) ratingsAdded++;
    else if (sourceValues.get(key) !== rating) ratingsChanged++;
  }
  for (const key of sourceValues.keys()) if (!currentValues.has(key)) ratingsRemoved++;
  const staleDataset = ratingsAdded + ratingsChanged + ratingsRemoved > 0;

  for (const row of parsed.rows) {
    if (!usersById.has(row.userId)) errors.push({ row: row.row, field: "user_id", message: `User ID ${row.userId} tidak ditemukan.` });
    else if (!sourceUsers.has(row.userId)) errors.push({ row: row.row, field: "user_id", message: `User ID ${row.userId} tidak memiliki rating pada dataset sumber.` });
    const food = foodsById.get(row.itemId);
    if (!food) errors.push({ row: row.row, field: "item_id", message: `Food ID ${row.itemId} tidak ditemukan.` });
    else if (!food.isActive) errors.push({ row: row.row, field: "item_id", message: `Food ID ${row.itemId} nonaktif dan tidak dapat dipublikasikan.` });
    if (sourcePairs.has(`${row.userId}:${row.itemId}`)) errors.push({ row: row.row, field: "item_id", message: `User ${row.userId} sudah menilai Food ${row.itemId} pada dataset sumber.` });
  }

  const candidates = parsed.rows.map(({ userId, itemId }) => ({ userId, foodId: itemId }));
  const currentCandidatePairs = new Set<string>();
  for (let index = 0; index < candidates.length; index += 400) {
    const chunk = candidates.slice(index, index + 400);
    if (!chunk.length) continue;
    const rated = await db.rating.findMany({ where: { OR: chunk.map(({ userId, foodId }) => ({ userId, foodId })) }, select: { userId: true, foodId: true } });
    for (const row of rated) currentCandidatePairs.add(`${row.userId}:${row.foodId}`);
  }
  const ratedAfterExportCount = parsed.rows.filter(({ userId, itemId }) => {
    const pair = `${userId}:${itemId}`;
    return currentCandidatePairs.has(pair) && !sourcePairs.has(pair);
  }).length;
  const warnings: RecommendationValidationReport["warnings"] = [];
  if (staleDataset) warnings.push({ code: "STALE_DATASET", message: `Rating berubah setelah snapshot dibuat (${ratingsAdded} baru, ${ratingsChanged} berubah, ${ratingsRemoved} dihapus). Perubahan ini belum diproses Altair.` });
  if (ratedAfterExportCount) warnings.push({ code: "RECOMMENDATIONS_RATED_AFTER_EXPORT", message: `${ratedAfterExportCount} rekomendasi sudah dinilai setelah snapshot; hasil tersebut akan disembunyikan dari pengguna terkait.` });

  const invalidLines = reportLineErrors(errors);
  const invalidRows = errors.some(({ row }) => row === 0) ? parsed.totalRows : Math.min(parsed.totalRows, invalidLines.size);
  const recommendedUsers = new Set(parsed.rows.map(({ userId }) => userId));
  const sourceUserCount = sourceUsers.size;
  const preview: RecommendationPreviewRow[] = parsed.rows
    .map((row) => ({
      row: row.row,
      userId: row.userId,
      userName: usersById.get(row.userId)?.name ?? null,
      foodId: row.itemId,
      foodName: foodsById.get(row.itemId)?.name ?? null,
      category: foodsById.get(row.itemId)?.category ?? null,
      imageUrl: foodsById.get(row.itemId)?.imageUrl ?? null,
      rank: row.rank,
      valid: !invalidLines.has(row.row)
    }))
    .sort((left, right) => left.userId - right.userId || left.rank - right.rank)
    .slice(0, RECOMMENDATION_PREVIEW_SIZE);
  const report: RecommendationValidationReport = {
    source: { datasetExportId: sourceDataset.id, filename: sourceDataset.filename, checksum: sourceDataset.fileChecksum, rowCount: sourceDataset.rowCount, createdAt: sourceDataset.createdAt.toISOString() },
    parameters: { kNeighbors: input.kNeighbors, topN: input.topN, similarity: "COSINE" },
    summary: {
      totalRows: parsed.totalRows,
      validRows: Math.max(0, parsed.totalRows - invalidRows),
      invalidRows,
      recommendationCount: parsed.rows.length,
      userCount: recommendedUsers.size,
      sourceUserCount,
      usersWithoutRecommendations: Math.max(0, sourceUserCount - [...recommendedUsers].filter((id) => sourceUsers.has(id)).length),
      staleDataset,
      ratingsAdded,
      ratingsChanged,
      ratingsRemoved,
      ratedAfterExportCount
    },
    errors,
    warnings,
    preview
  };
  return { report, errors, rows: parsed.rows };
}

export async function importRecommendationCsv(input: {
  datasetExportId: number;
  adminId: number;
  kNeighbors: number;
  topN: number;
  filename: string;
  buffer: Buffer;
}) {
  const { dataset, ratings } = await loadSourceDataset(prisma, input.datasetExportId);
  const parsed = parseRecommendationCsv(input.buffer, input.topN);
  const evaluated = await evaluateRecommendations(prisma, { ...input, filename: safeRecommendationFilename(input.filename) }, ratings, dataset, parsed);
  const fileChecksum = checksum(input.buffer);
  const filePath = await saveRecommendationImport(input.buffer);
  try {
    const status: RecommendationBatchStatus = evaluated.errors.length ? "DRAFT" : "VALIDATED";
    const batch = await prisma.$transaction(async (tx) => {
      const record = await tx.recommendationBatch.create({
        data: {
          datasetExportId: input.datasetExportId,
          adminId: input.adminId,
          status,
          kNeighbors: input.kNeighbors,
          topN: input.topN,
          similarity: "COSINE",
          fileChecksum,
          filename: safeRecommendationFilename(input.filename),
          filePath,
          validationReport: evaluated.report as Prisma.InputJsonValue
        }
      });
      if (status === "VALIDATED") {
        await tx.recommendation.createMany({ data: evaluated.rows.map(({ userId, itemId, rank }) => ({ batchId: record.id, userId, foodId: itemId, rank })) });
      }
      return record;
    });
    return { batch, report: evaluated.report };
  } catch (error) {
    await removeRecommendationImport(filePath).catch(() => undefined);
    throw error;
  }
}

async function revalidateBatch(tx: Database, batch: {
  id: number;
  datasetExportId: number;
  kNeighbors: number;
  topN: number;
  filename: string | null;
  filePath: string | null;
  fileChecksum: string;
}) {
  if (!batch.filePath || !batch.filename) throw new RecommendationDatasetError("RECOMMENDATION_FILE_UNAVAILABLE");
  let buffer: Buffer;
  try {
    buffer = await readRecommendationImport(batch.filePath);
  } catch {
    throw new RecommendationDatasetError("RECOMMENDATION_FILE_UNAVAILABLE");
  }
  if (checksum(buffer) !== batch.fileChecksum) throw new RecommendationDatasetError("RECOMMENDATION_CHECKSUM_MISMATCH");
  const { dataset, ratings } = await loadSourceDataset(tx, batch.datasetExportId);
  const parsed = parseRecommendationCsv(buffer, batch.topN);
  return evaluateRecommendations(tx, { datasetExportId: batch.datasetExportId, kNeighbors: batch.kNeighbors, topN: batch.topN, filename: batch.filename }, ratings, dataset, parsed);
}

function sameRecommendations(expected: ParsedRecommendationRow[], actual: { userId: number; foodId: number; rank: number }[]) {
  if (expected.length !== actual.length) return false;
  const expectedRows = expected.map(({ userId, itemId, rank }) => `${userId}:${itemId}:${rank}`).sort();
  const actualRows = actual.map(({ userId, foodId, rank }) => `${userId}:${foodId}:${rank}`).sort();
  return expectedRows.every((row, index) => row === actualRows[index]);
}

export async function publishRecommendationBatch(batchId: number, adminId: number) {
  return prisma.$transaction(async (tx) => {
    // Serializes publishers; partial unique index is final guard against two active batches.
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(7402193841::bigint)`;
    const batch = await tx.recommendationBatch.findUnique({ where: { id: batchId } });
    if (!batch) return { status: "NOT_FOUND" as const };
    if (batch.status === "PUBLISHED") return { status: "ALREADY_PUBLISHED" as const };
    if (batch.status === "SUPERSEDED") return { status: "SUPERSEDED" as const };

    const evaluated = await revalidateBatch(tx, batch);
    if (evaluated.errors.length) {
      await tx.recommendationBatch.update({ where: { id: batchId }, data: { validationReport: evaluated.report as Prisma.InputJsonValue } });
      return { status: "INVALID" as const, report: evaluated.report };
    }

    const existing = await tx.recommendation.findMany({ where: { batchId }, select: { userId: true, foodId: true, rank: true } });
    if (batch.status === "VALIDATED" && !sameRecommendations(evaluated.rows, existing)) {
      const report = { ...evaluated.report, errors: [{ row: 0, message: "Data rekomendasi tersimpan tidak cocok dengan file impor." }] };
      await tx.recommendationBatch.update({ where: { id: batchId }, data: { validationReport: report as Prisma.InputJsonValue } });
      return { status: "INVALID" as const, report };
    }
    if (batch.status === "DRAFT") {
      await tx.recommendation.createMany({ data: evaluated.rows.map(({ userId, itemId, rank }) => ({ batchId, userId, foodId: itemId, rank })) });
      await tx.recommendationBatch.update({ where: { id: batchId }, data: { status: "VALIDATED", validationReport: evaluated.report as Prisma.InputJsonValue } });
    }
    await tx.recommendationBatch.updateMany({ where: { status: "PUBLISHED" }, data: { status: "SUPERSEDED" } });
    const published = await tx.recommendationBatch.update({
      where: { id: batchId },
      data: { status: "PUBLISHED", publishedAt: new Date(), publishedById: adminId, validationReport: evaluated.report as Prisma.InputJsonValue }
    });
    return { status: "PUBLISHED" as const, batch: published, report: evaluated.report };
  });
}

export async function getUserRecommendations(userId: number) {
  const ratingCount = await prisma.rating.count({ where: { userId } });
  if (!ratingCount) return { status: "NO_RATINGS" as const, publishedAt: null, recommendations: [] };

  const batch = await prisma.recommendationBatch.findFirst({ where: { status: "PUBLISHED" }, orderBy: [{ publishedAt: "desc" }, { id: "desc" }], select: { id: true, publishedAt: true } });
  if (!batch) return { status: "NO_BATCH" as const, publishedAt: null, recommendations: [] };

  const rows = await prisma.recommendation.findMany({
    where: { batchId: batch.id, userId },
    orderBy: { rank: "asc" },
    select: { rank: true, foodId: true, food: { select: { id: true, name: true, category: true, description: true, imageUrl: true, isActive: true } } }
  });
  if (!rows.length) return { status: "NOT_INCLUDED" as const, publishedAt: batch.publishedAt, recommendations: [] };
  const activeRows = rows.filter(({ food }) => food.isActive);
  const ratedFoodIds = new Set((await prisma.rating.findMany({ where: { userId, foodId: { in: activeRows.map(({ foodId }) => foodId) } }, select: { foodId: true } })).map(({ foodId }) => foodId));
  const recommendations = activeRows.filter(({ foodId }) => !ratedFoodIds.has(foodId)).map(({ rank, food }) => ({ rank, food }));
  if (recommendations.length) return { status: "READY" as const, publishedAt: batch.publishedAt, recommendations };
  const allRecommendationsRated = activeRows.length === rows.length && activeRows.length > 0 && ratedFoodIds.size === activeRows.length;
  return { status: allRecommendationsRated ? "ALL_RATED" as const : "NO_AVAILABLE_FOODS" as const, publishedAt: batch.publishedAt, recommendations: [] };
}
