CREATE TYPE "ResearchStudyStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'ARCHIVED');
CREATE TYPE "ResearchParticipantStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'WITHDRAWAL_REQUESTED', 'WITHDRAWN');
CREATE TYPE "ResearchWithdrawalStatus" AS ENUM ('PENDING', 'PROCESSED');
CREATE TYPE "ResearchExportStatus" AS ENUM ('READY', 'REVOCATION_REQUIRED', 'REVOKED');
CREATE TYPE "ResearchRatingChangeType" AS ENUM ('CREATED', 'UPDATED');

CREATE TABLE "ResearchStudy" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "description" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "dataCollected" TEXT NOT NULL,
    "dataUse" TEXT NOT NULL,
    "withdrawalInstructions" TEXT NOT NULL,
    "consentVersion" VARCHAR(40) NOT NULL,
    "consentDocument" TEXT NOT NULL,
    "contactName" VARCHAR(120) NOT NULL,
    "contactEmail" VARCHAR(254) NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "status" "ResearchStudyStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByAdminId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ResearchStudy_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ResearchStudy_dates_check" CHECK ("startsAt" < "closesAt")
);

CREATE TABLE "ResearchParticipant" (
    "id" SERIAL NOT NULL,
    "studyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "status" "ResearchParticipantStatus" NOT NULL DEFAULT 'ACTIVE',
    "completedAt" TIMESTAMP(3),
    "withdrawalRequestedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ResearchParticipant_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ResearchParticipant_status_timestamps_check" CHECK (
        ("status" = 'ACTIVE' AND "completedAt" IS NULL AND "withdrawalRequestedAt" IS NULL AND "withdrawnAt" IS NULL)
        OR ("status" = 'COMPLETED' AND "completedAt" IS NOT NULL AND "withdrawalRequestedAt" IS NULL AND "withdrawnAt" IS NULL)
        OR ("status" = 'WITHDRAWAL_REQUESTED' AND "withdrawalRequestedAt" IS NOT NULL AND "withdrawnAt" IS NULL)
        OR ("status" = 'WITHDRAWN' AND "withdrawalRequestedAt" IS NOT NULL AND "withdrawnAt" IS NOT NULL)
    )
);

CREATE TABLE "ResearchConsent" (
    "id" SERIAL NOT NULL,
    "participantId" INTEGER NOT NULL,
    "version" VARCHAR(40) NOT NULL,
    "documentText" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "ResearchConsent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResearchRating" (
    "id" SERIAL NOT NULL,
    "participantId" INTEGER NOT NULL,
    "foodId" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "triedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ResearchRating_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ResearchRating_rating_range_check" CHECK ("rating" BETWEEN 1 AND 5)
);

CREATE TABLE "ResearchRatingChange" (
    "id" SERIAL NOT NULL,
    "participantId" INTEGER NOT NULL,
    "foodId" INTEGER NOT NULL,
    "changeType" "ResearchRatingChangeType" NOT NULL,
    "oldRating" INTEGER,
    "newRating" INTEGER NOT NULL,
    "idempotencyKey" VARCHAR(36) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResearchRatingChange_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ResearchRatingChange_rating_range_check" CHECK (
        "newRating" BETWEEN 1 AND 5 AND ("oldRating" IS NULL OR "oldRating" BETWEEN 1 AND 5)
    ),
    CONSTRAINT "ResearchRatingChange_type_check" CHECK (
        ("changeType" = 'CREATED' AND "oldRating" IS NULL)
        OR ("changeType" = 'UPDATED' AND "oldRating" IS NOT NULL)
    )
);

CREATE TABLE "ResearchWithdrawal" (
    "id" SERIAL NOT NULL,
    "participantId" INTEGER NOT NULL,
    "status" "ResearchWithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "processedByAdminId" INTEGER,
    CONSTRAINT "ResearchWithdrawal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ResearchWithdrawal_processing_check" CHECK (
        ("status" = 'PENDING' AND "processedAt" IS NULL AND "processedByAdminId" IS NULL)
        OR ("status" = 'PROCESSED' AND "processedAt" IS NOT NULL AND "processedByAdminId" IS NOT NULL)
    )
);

CREATE TABLE "ResearchExport" (
    "id" SERIAL NOT NULL,
    "studyId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "createdByAdminId" INTEGER NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "filePath" VARCHAR(64) NOT NULL,
    "fileChecksum" VARCHAR(64) NOT NULL,
    "participantCount" INTEGER NOT NULL,
    "ratingCount" INTEGER NOT NULL,
    "foodCount" INTEGER NOT NULL,
    "consentVersion" VARCHAR(40) NOT NULL,
    "manifest" JSONB NOT NULL,
    "status" "ResearchExportStatus" NOT NULL DEFAULT 'READY',
    "withdrawalAffectedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResearchExport_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ResearchExport_version_check" CHECK ("version" > 0),
    CONSTRAINT "ResearchExport_counts_check" CHECK (
        "participantCount" >= 0 AND "ratingCount" >= 0 AND "foodCount" >= 0
    ),
    CONSTRAINT "ResearchExport_status_check" CHECK (
        ("status" = 'READY' AND "withdrawalAffectedAt" IS NULL AND "revokedAt" IS NULL)
        OR ("status" = 'REVOCATION_REQUIRED' AND "withdrawalAffectedAt" IS NOT NULL AND "revokedAt" IS NULL)
        OR ("status" = 'REVOKED' AND "withdrawalAffectedAt" IS NOT NULL AND "revokedAt" IS NOT NULL)
    )
);

CREATE TABLE "ResearchExportParticipant" (
    "exportId" INTEGER NOT NULL,
    "participantId" INTEGER NOT NULL,
    CONSTRAINT "ResearchExportParticipant_pkey" PRIMARY KEY ("exportId", "participantId")
);

CREATE UNIQUE INDEX "ResearchStudy_one_open_idx" ON "ResearchStudy"("status") WHERE "status" = 'OPEN';
CREATE INDEX "ResearchStudy_status_startsAt_closesAt_idx" ON "ResearchStudy"("status", "startsAt", "closesAt");
CREATE INDEX "ResearchStudy_createdByAdminId_createdAt_idx" ON "ResearchStudy"("createdByAdminId", "createdAt");
CREATE UNIQUE INDEX "ResearchParticipant_studyId_userId_key" ON "ResearchParticipant"("studyId", "userId");
CREATE INDEX "ResearchParticipant_studyId_status_idx" ON "ResearchParticipant"("studyId", "status");
CREATE INDEX "ResearchParticipant_userId_createdAt_idx" ON "ResearchParticipant"("userId", "createdAt");
CREATE UNIQUE INDEX "ResearchConsent_participantId_version_key" ON "ResearchConsent"("participantId", "version");
CREATE INDEX "ResearchConsent_participantId_version_revokedAt_idx" ON "ResearchConsent"("participantId", "version", "revokedAt");
CREATE UNIQUE INDEX "ResearchRating_participantId_foodId_key" ON "ResearchRating"("participantId", "foodId");
CREATE INDEX "ResearchRating_foodId_rating_idx" ON "ResearchRating"("foodId", "rating");
CREATE INDEX "ResearchRating_participantId_updatedAt_idx" ON "ResearchRating"("participantId", "updatedAt");
CREATE UNIQUE INDEX "ResearchRatingChange_participantId_idempotencyKey_key" ON "ResearchRatingChange"("participantId", "idempotencyKey");
CREATE INDEX "ResearchRatingChange_participantId_createdAt_idx" ON "ResearchRatingChange"("participantId", "createdAt");
CREATE INDEX "ResearchRatingChange_foodId_createdAt_idx" ON "ResearchRatingChange"("foodId", "createdAt");
CREATE UNIQUE INDEX "ResearchWithdrawal_participantId_key" ON "ResearchWithdrawal"("participantId");
CREATE INDEX "ResearchWithdrawal_status_requestedAt_idx" ON "ResearchWithdrawal"("status", "requestedAt");
CREATE UNIQUE INDEX "ResearchExport_studyId_version_key" ON "ResearchExport"("studyId", "version");
CREATE INDEX "ResearchExport_createdByAdminId_createdAt_idx" ON "ResearchExport"("createdByAdminId", "createdAt");
CREATE INDEX "ResearchExport_studyId_createdAt_idx" ON "ResearchExport"("studyId", "createdAt");
CREATE INDEX "ResearchExport_status_withdrawalAffectedAt_idx" ON "ResearchExport"("status", "withdrawalAffectedAt");
CREATE INDEX "ResearchExportParticipant_participantId_exportId_idx" ON "ResearchExportParticipant"("participantId", "exportId");

ALTER TABLE "ResearchStudy" ADD CONSTRAINT "ResearchStudy_createdByAdminId_fkey"
    FOREIGN KEY ("createdByAdminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResearchParticipant" ADD CONSTRAINT "ResearchParticipant_studyId_fkey"
    FOREIGN KEY ("studyId") REFERENCES "ResearchStudy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResearchParticipant" ADD CONSTRAINT "ResearchParticipant_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResearchConsent" ADD CONSTRAINT "ResearchConsent_participantId_fkey"
    FOREIGN KEY ("participantId") REFERENCES "ResearchParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResearchRating" ADD CONSTRAINT "ResearchRating_participantId_fkey"
    FOREIGN KEY ("participantId") REFERENCES "ResearchParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResearchRating" ADD CONSTRAINT "ResearchRating_foodId_fkey"
    FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResearchRatingChange" ADD CONSTRAINT "ResearchRatingChange_participantId_fkey"
    FOREIGN KEY ("participantId") REFERENCES "ResearchParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResearchRatingChange" ADD CONSTRAINT "ResearchRatingChange_foodId_fkey"
    FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResearchWithdrawal" ADD CONSTRAINT "ResearchWithdrawal_participantId_fkey"
    FOREIGN KEY ("participantId") REFERENCES "ResearchParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResearchWithdrawal" ADD CONSTRAINT "ResearchWithdrawal_processedByAdminId_fkey"
    FOREIGN KEY ("processedByAdminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResearchExport" ADD CONSTRAINT "ResearchExport_studyId_fkey"
    FOREIGN KEY ("studyId") REFERENCES "ResearchStudy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResearchExport" ADD CONSTRAINT "ResearchExport_createdByAdminId_fkey"
    FOREIGN KEY ("createdByAdminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResearchExportParticipant" ADD CONSTRAINT "ResearchExportParticipant_exportId_fkey"
    FOREIGN KEY ("exportId") REFERENCES "ResearchExport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResearchExportParticipant" ADD CONSTRAINT "ResearchExportParticipant_participantId_fkey"
    FOREIGN KEY ("participantId") REFERENCES "ResearchParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION foodrec_validate_research_study() RETURNS trigger AS $$
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
                  NEW."contactEmail", NEW."startsAt", NEW."closesAt", NEW."createdByAdminId")
              IS DISTINCT FROM
              ROW(OLD."title", OLD."description", OLD."purpose", OLD."dataCollected", OLD."dataUse",
                  OLD."withdrawalInstructions", OLD."consentVersion", OLD."consentDocument", OLD."contactName",
                  OLD."contactEmail", OLD."startsAt", OLD."closesAt", OLD."createdByAdminId") THEN
            RAISE EXCEPTION 'Closed research studies are immutable; only archiving is allowed';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD."status" = 'OPEN' AND NEW."status" = 'DRAFT' THEN
        RAISE EXCEPTION 'An open research study cannot be reopened as draft';
    END IF;
    IF OLD."status" = 'OPEN' AND NEW."status" = 'CLOSED'
       AND ROW(NEW."title", NEW."description", NEW."purpose", NEW."dataCollected", NEW."dataUse",
               NEW."withdrawalInstructions", NEW."consentVersion", NEW."consentDocument", NEW."contactName",
               NEW."contactEmail", NEW."startsAt", NEW."closesAt", NEW."createdByAdminId")
          IS DISTINCT FROM
          ROW(OLD."title", OLD."description", OLD."purpose", OLD."dataCollected", OLD."dataUse",
              OLD."withdrawalInstructions", OLD."consentVersion", OLD."consentDocument", OLD."contactName",
              OLD."contactEmail", OLD."startsAt", OLD."closesAt", OLD."createdByAdminId") THEN
        RAISE EXCEPTION 'Close a research study without changing its configuration';
    END IF;

    material_fields_changed := ROW(NEW."title", NEW."description", NEW."purpose", NEW."dataCollected", NEW."dataUse",
                                   NEW."withdrawalInstructions", NEW."consentDocument", NEW."contactName", NEW."contactEmail")
                               IS DISTINCT FROM
                               ROW(OLD."title", OLD."description", OLD."purpose", OLD."dataCollected", OLD."dataUse",
                                   OLD."withdrawalInstructions", OLD."consentDocument", OLD."contactName", OLD."contactEmail");
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
        OR NEW."startsAt" > CURRENT_TIMESTAMP OR NEW."closesAt" <= CURRENT_TIMESTAMP
    ) THEN
        RAISE EXCEPTION 'Research study is not fully configured or outside its collection dates';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ResearchStudy_validate_state
BEFORE UPDATE ON "ResearchStudy"
FOR EACH ROW EXECUTE FUNCTION foodrec_validate_research_study();

CREATE FUNCTION foodrec_protect_research_consent() RETURNS trigger AS $$
BEGIN
    IF ROW(NEW."id", NEW."participantId", NEW."version", NEW."documentText", NEW."acceptedAt")
       IS DISTINCT FROM ROW(OLD."id", OLD."participantId", OLD."version", OLD."documentText", OLD."acceptedAt")
       OR (OLD."revokedAt" IS NOT NULL AND NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt") THEN
        RAISE EXCEPTION 'Research consent evidence is immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ResearchConsent_immutable_evidence
BEFORE UPDATE ON "ResearchConsent"
FOR EACH ROW EXECUTE FUNCTION foodrec_protect_research_consent();

CREATE FUNCTION foodrec_protect_research_rating_change() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Research rating change history cannot be updated';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ResearchRatingChange_immutable
BEFORE UPDATE ON "ResearchRatingChange"
FOR EACH ROW EXECUTE FUNCTION foodrec_protect_research_rating_change();

CREATE FUNCTION foodrec_protect_research_export() RETURNS trigger AS $$
BEGIN
    IF ROW(NEW."id", NEW."studyId", NEW."version", NEW."createdByAdminId", NEW."filename", NEW."filePath",
           NEW."fileChecksum", NEW."participantCount", NEW."ratingCount", NEW."foodCount", NEW."consentVersion",
           NEW."manifest", NEW."createdAt")
       IS DISTINCT FROM
       ROW(OLD."id", OLD."studyId", OLD."version", OLD."createdByAdminId", OLD."filename", OLD."filePath",
           OLD."fileChecksum", OLD."participantCount", OLD."ratingCount", OLD."foodCount", OLD."consentVersion",
           OLD."manifest", OLD."createdAt") THEN
        RAISE EXCEPTION 'Research export snapshot metadata is immutable';
    END IF;
    IF OLD."status" = 'REVOKED' AND NEW."status" <> 'REVOKED' THEN
        RAISE EXCEPTION 'Research export revocation is irreversible';
    END IF;
    IF NEW."status" = 'REVOCATION_REQUIRED' AND NEW."withdrawalAffectedAt" IS NULL THEN
        RAISE EXCEPTION 'Affected research exports require a withdrawal timestamp';
    END IF;
    IF NEW."status" = 'REVOKED' AND (NEW."withdrawalAffectedAt" IS NULL OR NEW."revokedAt" IS NULL) THEN
        RAISE EXCEPTION 'Revoked research exports require affected and revoked timestamps';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ResearchExport_protect_snapshot
BEFORE UPDATE ON "ResearchExport"
FOR EACH ROW EXECUTE FUNCTION foodrec_protect_research_export();
