ALTER TABLE "ResearchStudy"
    ADD COLUMN "retentionUntil" TIMESTAMP(3),
    ADD COLUMN "retentionPolicy" TEXT;

ALTER TABLE "ResearchStudy" ADD CONSTRAINT "ResearchStudy_retention_check"
    CHECK ("retentionUntil" IS NULL OR "retentionUntil" > "closesAt");

CREATE OR REPLACE FUNCTION foodrec_validate_research_study() RETURNS trigger AS $$
DECLARE
    material_fields_changed BOOLEAN;
BEGIN
    IF OLD."status" = 'ARCHIVED' THEN
        RAISE EXCEPTION 'Archived research studies are immutable';
    END IF;

    IF OLD."status" = 'CLOSED' THEN
        IF NEW."status" <> 'ARCHIVED'
           OR ROW(NEW."title", NEW."description", NEW."purpose", NEW."dataCollected", NEW."dataUse",
                  NEW."withdrawalInstructions", NEW."consentVersion", NEW."consentDocument", NEW."contactName",
                  NEW."contactEmail", NEW."startsAt", NEW."closesAt", NEW."retentionUntil", NEW."retentionPolicy", NEW."createdByAdminId")
              IS DISTINCT FROM
              ROW(OLD."title", OLD."description", OLD."purpose", OLD."dataCollected", OLD."dataUse",
                  OLD."withdrawalInstructions", OLD."consentVersion", OLD."consentDocument", OLD."contactName",
                  OLD."contactEmail", OLD."startsAt", OLD."closesAt", OLD."retentionUntil", OLD."retentionPolicy", OLD."createdByAdminId") THEN
            RAISE EXCEPTION 'Closed research studies are immutable; only archiving is allowed';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD."status" = 'OPEN' AND NEW."status" = 'DRAFT' THEN
        RAISE EXCEPTION 'An open research study cannot be reopened as draft';
    END IF;
    IF NEW."status" = 'OPEN' AND NEW."consentVersion" <> OLD."consentVersion" AND EXISTS (
        SELECT 1
        FROM "ResearchParticipant" participant
        JOIN "ResearchConsent" consent ON consent."participantId" = participant."id"
        WHERE participant."studyId" = OLD."id" AND consent."version" = NEW."consentVersion"
    ) THEN
        RAISE EXCEPTION 'A previously accepted consent version cannot be reused';
    END IF;
    IF OLD."status" = 'OPEN' AND NEW."status" = 'CLOSED'
       AND ROW(NEW."title", NEW."description", NEW."purpose", NEW."dataCollected", NEW."dataUse",
               NEW."withdrawalInstructions", NEW."consentVersion", NEW."consentDocument", NEW."contactName",
               NEW."contactEmail", NEW."startsAt", NEW."closesAt", NEW."retentionUntil", NEW."retentionPolicy", NEW."createdByAdminId")
          IS DISTINCT FROM
          ROW(OLD."title", OLD."description", OLD."purpose", OLD."dataCollected", OLD."dataUse",
              OLD."withdrawalInstructions", OLD."consentVersion", OLD."consentDocument", OLD."contactName",
              OLD."contactEmail", OLD."startsAt", OLD."closesAt", OLD."retentionUntil", OLD."retentionPolicy", OLD."createdByAdminId") THEN
        RAISE EXCEPTION 'Close a research study without changing its configuration';
    END IF;

    material_fields_changed := ROW(NEW."title", NEW."description", NEW."purpose", NEW."dataCollected", NEW."dataUse",
                                   NEW."withdrawalInstructions", NEW."consentDocument", NEW."contactName", NEW."contactEmail",
                                   NEW."retentionUntil", NEW."retentionPolicy")
                               IS DISTINCT FROM
                               ROW(OLD."title", OLD."description", OLD."purpose", OLD."dataCollected", OLD."dataUse",
                                   OLD."withdrawalInstructions", OLD."consentDocument", OLD."contactName", OLD."contactEmail",
                                   OLD."retentionUntil", OLD."retentionPolicy");
    IF OLD."status" = 'OPEN' AND NEW."status" = 'OPEN' AND material_fields_changed
       AND NEW."consentVersion" = OLD."consentVersion" THEN
        RAISE EXCEPTION 'Material research study changes require a new consent version';
    END IF;

    IF NEW."status" = 'OPEN' AND (
        length(btrim(NEW."title")) = 0 OR length(btrim(NEW."description")) = 0
        OR length(btrim(NEW."purpose")) = 0 OR length(btrim(NEW."dataCollected")) = 0
        OR length(btrim(NEW."dataUse")) = 0 OR length(btrim(NEW."withdrawalInstructions")) = 0
        OR length(btrim(NEW."consentVersion")) = 0 OR length(btrim(NEW."consentDocument")) = 0
        OR length(btrim(NEW."contactName")) = 0 OR length(btrim(NEW."contactEmail")) = 0
        OR NEW."retentionUntil" IS NULL OR length(btrim(COALESCE(NEW."retentionPolicy", ''))) = 0
        OR NEW."retentionUntil" <= NEW."closesAt"
        OR NEW."startsAt" > CURRENT_TIMESTAMP OR NEW."closesAt" <= CURRENT_TIMESTAMP
    ) THEN
        RAISE EXCEPTION 'Research study is not fully configured or outside its collection dates';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
