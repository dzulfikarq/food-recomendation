CREATE FUNCTION foodrec_block_unvalidated_automatic_jobs() RETURNS trigger AS $$
BEGIN
    IF NEW."trigger" = 'AUTO_RATING_CHANGE' THEN
        RAISE EXCEPTION 'Automatic recommendation jobs are disabled pending mathematical parity validation'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER RecommendationJob_block_automatic_processing
BEFORE INSERT OR UPDATE OF "trigger" ON "RecommendationJob"
FOR EACH ROW EXECUTE FUNCTION foodrec_block_unvalidated_automatic_jobs();
