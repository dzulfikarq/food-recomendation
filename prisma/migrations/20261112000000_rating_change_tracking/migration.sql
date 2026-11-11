ALTER TABLE "DatasetExport"
    ADD COLUMN "ratingRevision" BIGINT NOT NULL DEFAULT 0;

CREATE TABLE "RatingDatasetState" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "currentRevision" BIGINT NOT NULL DEFAULT 0,
    "processedRevision" BIGINT NOT NULL DEFAULT 0,
    "lastRatingChangedAt" TIMESTAMP(3),
    CONSTRAINT "RatingDatasetState_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RatingDatasetState_singleton_check" CHECK ("id" = 1),
    CONSTRAINT "RatingDatasetState_revision_check" CHECK (
        "currentRevision" >= 0 AND "processedRevision" >= 0 AND "processedRevision" <= "currentRevision"
    )
);

INSERT INTO "RatingDatasetState" ("id", "currentRevision", "processedRevision", "lastRatingChangedAt")
VALUES (
    1,
    CASE WHEN EXISTS (SELECT 1 FROM "Rating") THEN 1 ELSE 0 END,
    0,
    CASE WHEN EXISTS (SELECT 1 FROM "Rating") THEN CURRENT_TIMESTAMP ELSE NULL END
);

CREATE FUNCTION foodrec_record_rating_dataset_change() RETURNS trigger AS $$
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

CREATE TRIGGER Rating_record_dataset_change
AFTER INSERT OR UPDATE OF "rating" OR DELETE ON "Rating"
FOR EACH ROW EXECUTE FUNCTION foodrec_record_rating_dataset_change();
