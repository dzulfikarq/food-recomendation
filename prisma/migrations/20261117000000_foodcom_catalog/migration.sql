ALTER TABLE "Food"
    ALTER COLUMN "name" TYPE TEXT,
    ALTER COLUMN "category" DROP NOT NULL,
    ALTER COLUMN "taste" DROP NOT NULL,
    ALTER COLUMN "origin" DROP NOT NULL,
    ADD COLUMN "sourceDataset" VARCHAR(40) NOT NULL DEFAULT 'FOODREC_MANUAL',
    ADD COLUMN "sourceId" VARCHAR(64),
    ADD COLUMN "sourceVersion" VARCHAR(80),
    ADD COLUMN "sourceImportId" INTEGER,
    ADD COLUMN "minutes" INTEGER,
    ADD COLUMN "submittedAt" DATE,
    ADD COLUMN "nSteps" INTEGER,
    ADD COLUMN "nIngredients" INTEGER,
    ADD COLUMN "tags" JSONB,
    ADD COLUMN "nutrition" JSONB,
    ADD COLUMN "steps" JSONB,
    ADD COLUMN "ingredients" JSONB;

CREATE TABLE "FoodCatalogImport" (
    "id" SERIAL NOT NULL,
    "sourceDataset" VARCHAR(40) NOT NULL DEFAULT 'FOODCOM',
    "sourceVersion" VARCHAR(80) NOT NULL,
    "sourceUrl" TEXT,
    "rightsReviewReference" VARCHAR(160),
    "preparedManifestSha256" VARCHAR(64),
    "manifestSha256" VARCHAR(64) NOT NULL,
    "samplingStrategy" VARCHAR(40) NOT NULL,
    "seed" INTEGER NOT NULL,
    "userCount" INTEGER NOT NULL,
    "recipeCount" INTEGER NOT NULL,
    "ratingCount" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FoodCatalogImport_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FoodCatalogImport_counts_check" CHECK (
        "userCount" > 0 AND "recipeCount" > 0 AND "ratingCount" > 0
    )
);

CREATE TABLE "HistoricalRating" (
    "importId" INTEGER NOT NULL,
    "sourceUserId" BIGINT NOT NULL,
    "foodId" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HistoricalRating_pkey" PRIMARY KEY ("importId", "sourceUserId", "foodId"),
    CONSTRAINT "HistoricalRating_source_user_positive_check" CHECK ("sourceUserId" > 0),
    CONSTRAINT "HistoricalRating_rating_range_check" CHECK ("rating" BETWEEN 1 AND 5)
);

CREATE UNIQUE INDEX "Food_sourceDataset_sourceId_key" ON "Food"("sourceDataset", "sourceId");
CREATE INDEX "Food_sourceDataset_isActive_idx" ON "Food"("sourceDataset", "isActive");
CREATE UNIQUE INDEX "FoodCatalogImport_manifestSha256_key" ON "FoodCatalogImport"("manifestSha256");
CREATE INDEX "FoodCatalogImport_sourceDataset_isActive_idx" ON "FoodCatalogImport"("sourceDataset", "isActive");
CREATE UNIQUE INDEX "FoodCatalogImport_one_active_source_idx" ON "FoodCatalogImport"("sourceDataset") WHERE "isActive";
CREATE INDEX "HistoricalRating_importId_sourceUserId_idx" ON "HistoricalRating"("importId", "sourceUserId");
CREATE INDEX "HistoricalRating_foodId_idx" ON "HistoricalRating"("foodId");

ALTER TABLE "Food"
    ADD CONSTRAINT "Food_sourceImportId_fkey"
    FOREIGN KEY ("sourceImportId") REFERENCES "FoodCatalogImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HistoricalRating"
    ADD CONSTRAINT "HistoricalRating_importId_fkey"
    FOREIGN KEY ("importId") REFERENCES "FoodCatalogImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "HistoricalRating_foodId_fkey"
    FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION foodrec_record_historical_rating_dataset_change() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'DELETE' OR NEW."rating" IS DISTINCT FROM OLD."rating" THEN
        UPDATE "RatingDatasetState"
        SET "currentRevision" = "currentRevision" + 1,
            "lastRatingChangedAt" = CURRENT_TIMESTAMP
        WHERE "id" = 1;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'RatingDatasetState singleton row is missing';
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER HistoricalRating_record_dataset_change
AFTER INSERT OR UPDATE OF "rating" OR DELETE ON "HistoricalRating"
FOR EACH ROW EXECUTE FUNCTION foodrec_record_historical_rating_dataset_change();
