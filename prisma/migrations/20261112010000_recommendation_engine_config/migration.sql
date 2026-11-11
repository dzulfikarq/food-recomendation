CREATE TABLE "RecommendationEngineConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "autoProcessingEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
    "automaticPublicationEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
    "kNeighbors" INTEGER NOT NULL DEFAULT 3,
    "topN" INTEGER NOT NULL DEFAULT 5,
    "scheduleIntervalMinutes" INTEGER NOT NULL DEFAULT 30,
    "engineVersion" VARCHAR(40) NOT NULL DEFAULT 'python-ubcf-v1',
    "lastSuccessfulProcessingAt" TIMESTAMP(3),
    "validationStatus" VARCHAR(40) NOT NULL DEFAULT 'PENDING_VALIDATION',
    CONSTRAINT "RecommendationEngineConfig_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RecommendationEngineConfig_singleton_check" CHECK ("id" = 1),
    CONSTRAINT "RecommendationEngineConfig_processing_gate_check" CHECK ("autoProcessingEnabled" = FALSE),
    CONSTRAINT "RecommendationEngineConfig_publication_gate_check" CHECK ("automaticPublicationEnabled" = FALSE),
    CONSTRAINT "RecommendationEngineConfig_validation_gate_check" CHECK ("validationStatus" = 'PENDING_VALIDATION'),
    CONSTRAINT "RecommendationEngineConfig_engine_version_check" CHECK ("engineVersion" = 'python-ubcf-v1'),
    CONSTRAINT "RecommendationEngineConfig_parameters_check" CHECK (
        "kNeighbors" BETWEEN 1 AND 100 AND "topN" BETWEEN 1 AND 100 AND
        "scheduleIntervalMinutes" BETWEEN 1 AND 10080
    )
);

INSERT INTO "RecommendationEngineConfig" ("id") VALUES (1);
