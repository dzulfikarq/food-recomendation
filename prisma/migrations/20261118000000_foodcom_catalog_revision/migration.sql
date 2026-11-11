CREATE FUNCTION foodrec_record_catalog_activation_change() RETURNS trigger AS $$
BEGIN
    IF NEW."isActive" IS DISTINCT FROM OLD."isActive" THEN
        UPDATE "RatingDatasetState"
        SET "currentRevision" = "currentRevision" + 1,
            "lastRatingChangedAt" = CURRENT_TIMESTAMP
        WHERE "id" = 1;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'RatingDatasetState singleton row is missing';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER FoodCatalogImport_record_dataset_change
AFTER UPDATE OF "isActive" ON "FoodCatalogImport"
FOR EACH ROW EXECUTE FUNCTION foodrec_record_catalog_activation_change();
