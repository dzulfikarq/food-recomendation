-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "FoodImportStatus" AS ENUM ('VALIDATED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "RecommendationBatchStatus" AS ENUM ('DRAFT', 'VALIDATED', 'PUBLISHED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Session" (
    "id" SERIAL NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" VARCHAR(64),
    "userAgent" TEXT,
    "userId" INTEGER NOT NULL,
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Account" (
    "id" SERIAL NOT NULL,
    "accountId" VARCHAR(255) NOT NULL,
    "providerId" VARCHAR(100) NOT NULL,
    "userId" INTEGER NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Verification" (
    "id" SERIAL NOT NULL,
    "identifier" VARCHAR(255) NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Food" (
    "id" SERIAL NOT NULL,
    "foodCode" VARCHAR(64) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(100) NOT NULL,
    "taste" VARCHAR(100) NOT NULL,
    "healthLevel" VARCHAR(80),
    "origin" VARCHAR(100) NOT NULL,
    "proteinType" VARCHAR(100),
    "priceCategory" VARCHAR(80),
    "mealTime" VARCHAR(80),
    "dietCategory" VARCHAR(100),
    "texture" VARCHAR(100),
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "firstUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Food_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Rating" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "foodId" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Rating_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Rating_rating_range_check" CHECK ("rating" BETWEEN 1 AND 5)
);

CREATE TABLE "FoodImport" (
    "id" SERIAL NOT NULL,
    "adminId" INTEGER NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "fileChecksum" VARCHAR(64) NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "insertedRows" INTEGER NOT NULL,
    "status" "FoodImportStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FoodImport_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FoodImport_row_counts_check" CHECK ("totalRows" >= 0 AND "insertedRows" >= 0 AND "insertedRows" <= "totalRows")
);

CREATE TABLE "DatasetExport" (
    "id" SERIAL NOT NULL,
    "adminId" INTEGER NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "fileChecksum" VARCHAR(64) NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "filePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DatasetExport_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DatasetExport_row_count_check" CHECK ("rowCount" >= 0)
);

CREATE TABLE "RecommendationBatch" (
    "id" SERIAL NOT NULL,
    "datasetExportId" INTEGER NOT NULL,
    "adminId" INTEGER NOT NULL,
    "status" "RecommendationBatchStatus" NOT NULL DEFAULT 'DRAFT',
    "kNeighbors" INTEGER NOT NULL,
    "topN" INTEGER NOT NULL,
    "similarity" VARCHAR(40) NOT NULL DEFAULT 'COSINE',
    "fileChecksum" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    CONSTRAINT "RecommendationBatch_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RecommendationBatch_parameters_check" CHECK ("kNeighbors" > 0 AND "topN" > 0)
);

CREATE TABLE "Recommendation" (
    "id" SERIAL NOT NULL,
    "batchId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "foodId" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Recommendation_rank_positive_check" CHECK ("rank" > 0)
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE INDEX "Account_userId_idx" ON "Account"("userId");
CREATE UNIQUE INDEX "Account_providerId_accountId_key" ON "Account"("providerId", "accountId");
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");
CREATE UNIQUE INDEX "Food_foodCode_key" ON "Food"("foodCode");
CREATE INDEX "Food_isActive_category_idx" ON "Food"("isActive", "category");
CREATE INDEX "Rating_userId_idx" ON "Rating"("userId");
CREATE INDEX "Rating_foodId_idx" ON "Rating"("foodId");
CREATE UNIQUE INDEX "Rating_userId_foodId_key" ON "Rating"("userId", "foodId");
CREATE INDEX "FoodImport_adminId_createdAt_idx" ON "FoodImport"("adminId", "createdAt");
CREATE INDEX "FoodImport_fileChecksum_idx" ON "FoodImport"("fileChecksum");
CREATE INDEX "DatasetExport_adminId_createdAt_idx" ON "DatasetExport"("adminId", "createdAt");
CREATE INDEX "DatasetExport_fileChecksum_idx" ON "DatasetExport"("fileChecksum");
CREATE INDEX "RecommendationBatch_datasetExportId_idx" ON "RecommendationBatch"("datasetExportId");
CREATE INDEX "RecommendationBatch_adminId_createdAt_idx" ON "RecommendationBatch"("adminId", "createdAt");
CREATE INDEX "RecommendationBatch_status_publishedAt_idx" ON "RecommendationBatch"("status", "publishedAt");
CREATE INDEX "Recommendation_userId_batchId_idx" ON "Recommendation"("userId", "batchId");
CREATE INDEX "Recommendation_foodId_idx" ON "Recommendation"("foodId");
CREATE UNIQUE INDEX "Recommendation_batchId_userId_foodId_key" ON "Recommendation"("batchId", "userId", "foodId");
CREATE UNIQUE INDEX "Recommendation_batchId_userId_rank_key" ON "Recommendation"("batchId", "userId", "rank");

ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FoodImport" ADD CONSTRAINT "FoodImport_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DatasetExport" ADD CONSTRAINT "DatasetExport_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecommendationBatch" ADD CONSTRAINT "RecommendationBatch_datasetExportId_fkey" FOREIGN KEY ("datasetExportId") REFERENCES "DatasetExport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecommendationBatch" ADD CONSTRAINT "RecommendationBatch_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "RecommendationBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "prevent_food_code_change"() RETURNS trigger AS $$
BEGIN
  IF NEW."foodCode" IS DISTINCT FROM OLD."foodCode" THEN
    RAISE EXCEPTION 'Food.foodCode is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Food_foodCode_immutable"
BEFORE UPDATE ON "Food"
FOR EACH ROW EXECUTE FUNCTION "prevent_food_code_change"();

CREATE FUNCTION "prevent_dataset_export_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'DatasetExport snapshots are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "DatasetExport_immutable"
BEFORE UPDATE OR DELETE ON "DatasetExport"
FOR EACH ROW EXECUTE FUNCTION "prevent_dataset_export_mutation"();

CREATE FUNCTION "prevent_history_delete"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Research history cannot be deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "FoodImport_no_delete"
BEFORE DELETE ON "FoodImport"
FOR EACH ROW EXECUTE FUNCTION "prevent_history_delete"();

CREATE TRIGGER "RecommendationBatch_no_delete"
BEFORE DELETE ON "RecommendationBatch"
FOR EACH ROW EXECUTE FUNCTION "prevent_history_delete"();
