ALTER TABLE "RecommendationEngineConfig"
    ADD COLUMN "schedulerLastCheckedAt" TIMESTAMP(3),
    ADD COLUMN "nextScheduleAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "lastSchedulerReason" VARCHAR(60);

CREATE TABLE "RecommendationWorker" (
    "workerId" VARCHAR(120) NOT NULL,
    "engineVersion" VARCHAR(40) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecommendationWorker_pkey" PRIMARY KEY ("workerId")
);

CREATE INDEX "RecommendationWorker_lastSeenAt_idx" ON "RecommendationWorker"("lastSeenAt");

ALTER TABLE "RecommendationJob"
    ADD COLUMN "automaticDedupeKey" VARCHAR(64),
    ADD CONSTRAINT "RecommendationJob_trigger_check"
        CHECK ("trigger" IN ('MANUAL_ADMIN', 'AUTO_RATING_CHANGE')),
    ADD CONSTRAINT "RecommendationJob_automatic_dedupe_check"
        CHECK (
            ("trigger" = 'MANUAL_ADMIN' AND "automaticDedupeKey" IS NULL) OR
            ("trigger" = 'AUTO_RATING_CHANGE' AND "automaticDedupeKey" IS NOT NULL)
        );

CREATE UNIQUE INDEX "RecommendationJob_automaticDedupeKey_key"
    ON "RecommendationJob"("automaticDedupeKey");

ALTER TABLE "RecommendationJobArtifact"
    ADD COLUMN "sourceRatingRevision" BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN "currentRatingRevision" BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN "isStale" BOOLEAN NOT NULL DEFAULT FALSE;
