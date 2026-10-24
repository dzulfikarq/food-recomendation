CREATE FUNCTION "prevent_used_food_delete"() RETURNS trigger AS $$
BEGIN
  IF OLD."firstUsedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Food with research history cannot be permanently deleted';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Food_firstUsedAt_delete_guard"
BEFORE DELETE ON "Food"
FOR EACH ROW EXECUTE FUNCTION "prevent_used_food_delete"();
