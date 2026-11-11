CREATE OR REPLACE FUNCTION foodrec_protect_research_consent() RETURNS trigger AS $$
BEGIN
    IF ROW(NEW."id", NEW."participantId", NEW."version", NEW."documentText", NEW."acceptedAt")
       IS DISTINCT FROM ROW(OLD."id", OLD."participantId", OLD."version", OLD."documentText", OLD."acceptedAt")
       OR (OLD."revokedAt" IS NOT NULL AND NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt") THEN
        RAISE EXCEPTION 'Research consent evidence is immutable';
    END IF;
    IF OLD."revokedAt" IS NULL AND NEW."revokedAt" IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "ResearchParticipant" participant
        WHERE participant."id" = OLD."participantId"
          AND participant."status" IN ('WITHDRAWAL_REQUESTED', 'WITHDRAWN')
    ) THEN
        RAISE EXCEPTION 'Consent revocation requires a participant withdrawal';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION foodrec_protect_research_participant_lifecycle() RETURNS trigger AS $$
BEGIN
    IF ROW(NEW."id", NEW."studyId", NEW."userId") IS DISTINCT FROM ROW(OLD."id", OLD."studyId", OLD."userId") THEN
        RAISE EXCEPTION 'Research participant identity is immutable';
    END IF;

    IF OLD."status" = 'WITHDRAWN' THEN
        IF ROW(NEW."status", NEW."completedAt", NEW."withdrawalRequestedAt", NEW."withdrawnAt")
           IS DISTINCT FROM ROW(OLD."status", OLD."completedAt", OLD."withdrawalRequestedAt", OLD."withdrawnAt") THEN
            RAISE EXCEPTION 'Withdrawn research participation is irreversible';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD."status" = 'WITHDRAWAL_REQUESTED' THEN
        IF NEW."status" <> 'WITHDRAWN'
           OR NEW."completedAt" IS DISTINCT FROM OLD."completedAt"
           OR NEW."withdrawalRequestedAt" IS DISTINCT FROM OLD."withdrawalRequestedAt"
           OR NEW."withdrawnAt" IS NULL THEN
            RAISE EXCEPTION 'A withdrawal request can only be processed into WITHDRAWN';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD."status" = NEW."status" THEN
        IF ROW(NEW."completedAt", NEW."withdrawalRequestedAt", NEW."withdrawnAt")
           IS DISTINCT FROM ROW(OLD."completedAt", OLD."withdrawalRequestedAt", OLD."withdrawnAt") THEN
            RAISE EXCEPTION 'Research participant lifecycle timestamps cannot be edited directly';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD."status" = 'ACTIVE' AND NEW."status" = 'COMPLETED' AND NEW."completedAt" IS NOT NULL THEN
        RETURN NEW;
    END IF;
    IF OLD."status" IN ('ACTIVE', 'COMPLETED') AND NEW."status" = 'WITHDRAWAL_REQUESTED'
       AND NEW."withdrawalRequestedAt" IS NOT NULL AND NEW."withdrawnAt" IS NULL THEN
        RETURN NEW;
    END IF;
    IF OLD."status" = 'COMPLETED' AND NEW."status" = 'ACTIVE'
       AND NEW."completedAt" IS NULL AND NEW."withdrawalRequestedAt" IS NULL AND NEW."withdrawnAt" IS NULL
       AND EXISTS (
           SELECT 1
           FROM "ResearchStudy" study
           JOIN "ResearchConsent" consent ON consent."participantId" = OLD."id"
               AND consent."version" = study."consentVersion" AND consent."revokedAt" IS NULL
           WHERE study."id" = OLD."studyId"
       ) THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Invalid research participant status transition';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ResearchParticipant_protect_lifecycle
BEFORE UPDATE ON "ResearchParticipant"
FOR EACH ROW EXECUTE FUNCTION foodrec_protect_research_participant_lifecycle();

CREATE FUNCTION foodrec_protect_research_withdrawal() RETURNS trigger AS $$
BEGIN
    IF ROW(NEW."id", NEW."participantId", NEW."requestedAt")
       IS DISTINCT FROM ROW(OLD."id", OLD."participantId", OLD."requestedAt") THEN
        RAISE EXCEPTION 'Research withdrawal request evidence is immutable';
    END IF;
    IF OLD."status" = 'PROCESSED' OR NEW."status" <> 'PROCESSED'
       OR NEW."processedAt" IS NULL OR NEW."processedByAdminId" IS NULL THEN
        RAISE EXCEPTION 'A pending research withdrawal can only be processed once';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ResearchWithdrawal_protect_lifecycle
BEFORE UPDATE ON "ResearchWithdrawal"
FOR EACH ROW EXECUTE FUNCTION foodrec_protect_research_withdrawal();

CREATE FUNCTION foodrec_protect_research_export_membership() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Research export membership is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ResearchExportParticipant_immutable
BEFORE UPDATE OR DELETE ON "ResearchExportParticipant"
FOR EACH ROW EXECUTE FUNCTION foodrec_protect_research_export_membership();

CREATE FUNCTION foodrec_guard_research_rating_deletion() RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "ResearchParticipant" participant
        WHERE participant."id" = OLD."participantId"
          AND participant."status" IN ('WITHDRAWAL_REQUESTED', 'WITHDRAWN')
    ) THEN
        RAISE EXCEPTION 'Research ratings can only be deleted during participant withdrawal';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ResearchRating_withdrawal_only_delete
BEFORE DELETE ON "ResearchRating"
FOR EACH ROW EXECUTE FUNCTION foodrec_guard_research_rating_deletion();

CREATE TRIGGER ResearchRatingChange_withdrawal_only_delete
BEFORE DELETE ON "ResearchRatingChange"
FOR EACH ROW EXECUTE FUNCTION foodrec_guard_research_rating_deletion();
