ALTER TABLE "RecommendationBatch"
  ADD COLUMN "publishedById" INTEGER,
  ADD COLUMN "filename" VARCHAR(255),
  ADD COLUMN "filePath" TEXT,
  ADD COLUMN "validationReport" JSONB;

UPDATE "RecommendationBatch"
SET "publishedAt" = COALESCE("publishedAt", "createdAt"),
    "publishedById" = COALESCE("publishedById", "adminId")
WHERE "status" = 'PUBLISHED';

WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "publishedAt" DESC, "createdAt" DESC, "id" DESC) AS position
  FROM "RecommendationBatch"
  WHERE "status" = 'PUBLISHED'
)
UPDATE "RecommendationBatch" AS batch
SET "status" = 'SUPERSEDED'
FROM ranked
WHERE batch."id" = ranked."id" AND ranked.position > 1;

ALTER TABLE "RecommendationBatch"
  ADD CONSTRAINT "RecommendationBatch_published_fields_check"
  CHECK ("status" <> 'PUBLISHED' OR ("publishedAt" IS NOT NULL AND "publishedById" IS NOT NULL));

CREATE INDEX "RecommendationBatch_publishedById_idx" ON "RecommendationBatch"("publishedById");
CREATE UNIQUE INDEX "RecommendationBatch_one_published_idx"
  ON "RecommendationBatch"("status") WHERE "status" = 'PUBLISHED';

ALTER TABLE "RecommendationBatch"
  ADD CONSTRAINT "RecommendationBatch_publishedById_fkey"
  FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
