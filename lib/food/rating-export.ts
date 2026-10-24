import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { removeRatingExport, saveRatingExport } from "@/lib/food/storage";

export class EmptyRatingDatasetError extends Error {}

export async function createRatingDatasetExport(adminId: number) {
  // ponytail: buffers one rating snapshot in memory; switch to cursor streaming if export sizes grow materially.
  const ratings = await prisma.rating.findMany({
    select: { userId: true, foodId: true, rating: true },
    orderBy: [{ userId: "asc" }, { foodId: "asc" }]
  });
  if (ratings.length === 0) throw new EmptyRatingDatasetError("Belum ada rating untuk diekspor.");

  // Export schema contains numeric IDs and rating only; it never includes user PII.
  const csv = ["user_id,food_id,rating", ...ratings.map(({ userId, foodId, rating }) => `${userId},${foodId},${rating}`)].join("\r\n") + "\r\n";
  const buffer = Buffer.from(csv, "utf8");
  const fileChecksum = createHash("sha256").update(buffer).digest("hex");
  const stagingKey = await saveRatingExport(buffer);
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const filename = `foodrec-ratings-${timestamp}-${randomUUID().slice(0, 8)}.csv`;

  try {
    const record = await prisma.datasetExport.create({
      data: { adminId, filename, fileChecksum, rowCount: ratings.length, filePath: stagingKey },
      select: { id: true, filename: true, fileChecksum: true, rowCount: true, createdAt: true }
    });
    return record;
  } catch (error) {
    await removeRatingExport(stagingKey).catch(() => undefined);
    throw error;
  }
}
