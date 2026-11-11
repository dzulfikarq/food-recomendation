import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { removeRatingExport, saveRatingExport } from "@/lib/food/storage";

export class EmptyRatingDatasetError extends Error {}
export class RatingDatasetTooLargeError extends Error {}

const MAX_RATING_SNAPSHOT_BYTES = 20 * 1024 * 1024;

export async function createRatingDatasetExportInTransaction(tx: Prisma.TransactionClient, adminId: number) {
  const state = await tx.$queryRaw<Array<{ currentRevision: bigint }>>`
    SELECT "currentRevision" FROM "RatingDatasetState" WHERE "id" = 1 FOR UPDATE
  `;
  if (!state[0]) throw new Error("Rating dataset state is missing.");
  // ponytail: buffers one rating snapshot in memory; switch to cursor streaming if export sizes grow materially.
  const [accountRatings, importedRatings] = await Promise.all([
    tx.rating.findMany({ select: { userId: true, foodId: true, rating: true } }),
    tx.historicalRating.findMany({
      where: { catalogImport: { isActive: true } },
      select: { sourceUserId: true, foodId: true, rating: true }
    })
  ]);
  const ratings = [
    ...accountRatings.map(({ userId, foodId, rating }) => ({ userId, foodId, rating })),
    ...importedRatings.map(({ sourceUserId, foodId, rating }) => {
      const numericSourceId = Number(sourceUserId);
      if (!Number.isSafeInteger(numericSourceId) || numericSourceId < 1) {
        throw new Error("Food.com source user ID exceeds snapshot integer range.");
      }
      return { userId: -numericSourceId, foodId, rating };
    })
  ].sort((left, right) => left.userId - right.userId || left.foodId - right.foodId);
  if (ratings.length === 0) throw new EmptyRatingDatasetError("Belum ada rating untuk diekspor.");

  // Historical Food.com IDs are negative; account IDs stay positive. Snapshot contains no user PII.
  const csv = ["user_id,food_id,rating", ...ratings.map(({ userId, foodId, rating }) => `${userId},${foodId},${rating}`)].join("\r\n") + "\r\n";
  const buffer = Buffer.from(csv, "utf8");
  if (buffer.byteLength > MAX_RATING_SNAPSHOT_BYTES) throw new RatingDatasetTooLargeError("Rating snapshot exceeds the worker's 20 MiB limit.");
  const fileChecksum = createHash("sha256").update(buffer).digest("hex");
  const stagingKey = await saveRatingExport(buffer);
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const filename = `foodrec-ratings-${timestamp}-${randomUUID().slice(0, 8)}.csv`;

  try {
    const record = await tx.datasetExport.create({
      data: { adminId, filename, fileChecksum, rowCount: ratings.length, filePath: stagingKey, ratingRevision: state[0].currentRevision },
      select: { id: true, filename: true, fileChecksum: true, rowCount: true, ratingRevision: true, createdAt: true }
    });
    return { record, stagingKey };
  } catch (error) {
    await removeRatingExport(stagingKey).catch(() => undefined);
    throw error;
  }
}

export async function createRatingDatasetExport(adminId: number) {
  let stagingKey: string | undefined;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const snapshot = await createRatingDatasetExportInTransaction(tx, adminId);
      stagingKey = snapshot.stagingKey;
      return snapshot.record;
    });
    return result;
  } catch (error) {
    if (stagingKey) await removeRatingExport(stagingKey).catch(() => undefined);
    throw error;
  }
}
