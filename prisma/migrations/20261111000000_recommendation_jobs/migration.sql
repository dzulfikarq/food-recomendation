CREATE TYPE "RecommendationJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

CREATE TABLE "RecommendationJob" (
    "id" UUID NOT NULL,
    "datasetExportId" INTEGER NOT NULL,
    "createdByAdminId" INTEGER NOT NULL,
    "trigger" VARCHAR(40) NOT NULL DEFAULT 'MANUAL_ADMIN',
    "idempotencyKey" VARCHAR(100) NOT NULL,
    "engineVersion" VARCHAR(40) NOT NULL,
    "parameters" JSONB NOT NULL,
    "status" "RecommendationJobStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "timeoutSeconds" INTEGER NOT NULL DEFAULT 900,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" UUID,
    "leaseExpiresAt" TIMESTAMP(3),
    "timeoutAt" TIMESTAMP(3),
    "workerId" VARCHAR(120),
    "heartbeatAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "errorSummary" VARCHAR(255),

    CONSTRAINT "RecommendationJob_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RecommendationJob_attempts_check" CHECK (
        "attemptCount" >= 0 AND "maxAttempts" BETWEEN 1 AND 5 AND "attemptCount" <= "maxAttempts"
    ),
    CONSTRAINT "RecommendationJob_timeout_check" CHECK ("timeoutSeconds" BETWEEN 1 AND 3600),
    CONSTRAINT "RecommendationJob_running_lease_check" CHECK (
        "status" <> 'RUNNING' OR (
            "leaseToken" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL AND
            "timeoutAt" IS NOT NULL AND "workerId" IS NOT NULL AND "heartbeatAt" IS NOT NULL
        )
    ),
    CONSTRAINT "RecommendationJob_succeeded_finished_check" CHECK (
        "status" <> 'SUCCEEDED' OR "finishedAt" IS NOT NULL
    )
);

CREATE TABLE "RecommendationJobArtifact" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "verificationStatus" VARCHAR(20) NOT NULL DEFAULT 'UNVERIFIED',
    "checksum" VARCHAR(64) NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationJobArtifact_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RecommendationJobArtifact_unverified_check" CHECK ("verificationStatus" = 'UNVERIFIED'),
    CONSTRAINT "RecommendationJobArtifact_checksum_check" CHECK ("checksum" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "RecommendationJobArtifact_row_count_check" CHECK ("rowCount" BETWEEN 0 AND 10000)
);

CREATE UNIQUE INDEX "RecommendationJob_idempotencyKey_key" ON "RecommendationJob"("idempotencyKey");
CREATE INDEX "RecommendationJob_status_nextAttemptAt_createdAt_idx" ON "RecommendationJob"("status", "nextAttemptAt", "createdAt");
CREATE INDEX "RecommendationJob_datasetExportId_createdAt_idx" ON "RecommendationJob"("datasetExportId", "createdAt");
CREATE INDEX "RecommendationJob_status_leaseExpiresAt_idx" ON "RecommendationJob"("status", "leaseExpiresAt");
CREATE UNIQUE INDEX "RecommendationJobArtifact_jobId_key" ON "RecommendationJobArtifact"("jobId");

ALTER TABLE "RecommendationJob"
    ADD CONSTRAINT "RecommendationJob_datasetExportId_fkey"
    FOREIGN KEY ("datasetExportId") REFERENCES "DatasetExport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RecommendationJob"
    ADD CONSTRAINT "RecommendationJob_createdByAdminId_fkey"
    FOREIGN KEY ("createdByAdminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RecommendationJobArtifact"
    ADD CONSTRAINT "RecommendationJobArtifact_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "RecommendationJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
