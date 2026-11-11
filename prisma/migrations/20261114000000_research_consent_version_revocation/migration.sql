ALTER TABLE "ResearchRating"
    ADD COLUMN "consentVersion" VARCHAR(40) NOT NULL DEFAULT 'legacy-unversioned';
ALTER TABLE "ResearchRating" ALTER COLUMN "consentVersion" DROP DEFAULT;

ALTER TABLE "ResearchRatingChange"
    ADD COLUMN "consentVersion" VARCHAR(40) NOT NULL DEFAULT 'legacy-unversioned';
ALTER TABLE "ResearchRatingChange" ALTER COLUMN "consentVersion" DROP DEFAULT;

CREATE TYPE "ResearchRatingSource" AS ENUM ('CONSENTED_USER_ACTION', 'UNVERIFIED_LEGACY');
ALTER TABLE "ResearchRating" ADD COLUMN "source" "ResearchRatingSource" NOT NULL DEFAULT 'UNVERIFIED_LEGACY';
ALTER TABLE "ResearchRating" ALTER COLUMN "source" DROP DEFAULT;
ALTER TABLE "ResearchRatingChange" ADD COLUMN "source" "ResearchRatingSource" NOT NULL DEFAULT 'UNVERIFIED_LEGACY';
ALTER TABLE "ResearchRatingChange" ALTER COLUMN "source" DROP DEFAULT;

CREATE TABLE "ResearchExportRevocation" (
    "id" SERIAL NOT NULL,
    "exportId" INTEGER NOT NULL,
    "adminId" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "externalRecipientsNotified" BOOLEAN NOT NULL,
    "fileDeleted" BOOLEAN NOT NULL,
    "revokedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResearchExportRevocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ResearchExportRevocation_exportId_key" ON "ResearchExportRevocation"("exportId");
CREATE INDEX "ResearchExportRevocation_adminId_revokedAt_idx" ON "ResearchExportRevocation"("adminId", "revokedAt");

ALTER TABLE "ResearchExportRevocation" ADD CONSTRAINT "ResearchExportRevocation_exportId_fkey"
    FOREIGN KEY ("exportId") REFERENCES "ResearchExport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResearchExportRevocation" ADD CONSTRAINT "ResearchExportRevocation_adminId_fkey"
    FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION foodrec_protect_research_export_revocation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Research export revocation evidence is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ResearchExportRevocation_immutable
BEFORE UPDATE OR DELETE ON "ResearchExportRevocation"
FOR EACH ROW EXECUTE FUNCTION foodrec_protect_research_export_revocation();
