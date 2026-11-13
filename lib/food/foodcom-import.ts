import "server-only";

import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

const MAX_RECIPES = 10_000;
const MAX_USERS = 500;
const MAX_RATINGS = 100_000;
const MAX_RATING_FILE_BYTES = 20 * 1024 * 1024;
const MAX_RECIPE_FILE_BYTES = 100 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 1024 * 1024;
const IMPORT_CHUNK_SIZE = 2_000;

type JsonRecord = Record<string, unknown>;
type Recipe = {
  foodCode: string;
  sourceDataset: "FOODCOM";
  sourceId: string;
  sourceVersion: string;
  name: string;
  description: string | null;
  category: null;
  taste: null;
  origin: null;
  imageUrl: null;
  minutes: number | null;
  submittedAt: Date | null;
  nSteps: number | null;
  nIngredients: number | null;
  tags: string[];
  nutrition: number[];
  steps: string[];
  ingredients: string[];
};

export class FoodComImportError extends Error {}

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function text(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    throw new FoodComImportError(`Invalid ${field} in Food.com export manifest.`);
  }
  return value;
}

function positiveInteger(value: unknown, field: string, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new FoodComImportError(`Invalid ${field} in Food.com export manifest.`);
  }
  return value;
}

function digest(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new FoodComImportError(`Invalid ${field} on Food.com recipe.`);
  }
  return value as string[];
}

function numberArray(value: unknown, field: string): number[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "number" || !Number.isFinite(item))) {
    throw new FoodComImportError(`Invalid ${field} on Food.com recipe.`);
  }
  return value as number[];
}

function nullableCount(value: unknown, field: string): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new FoodComImportError(`Invalid ${field} on Food.com recipe.`);
  }
  return value;
}

function readRecipe(value: unknown, sourceVersion: string): Recipe {
  const row = record(value);
  if (!row || row.sourceDataset !== "FOODCOM" || row.sourceVersion !== sourceVersion) {
    throw new FoodComImportError("Recipe source provenance does not match export manifest.");
  }
  const sourceId = text(row.sourceId, "recipe source ID", 64);
  if (!/^[1-9]\d*$/.test(sourceId)) throw new FoodComImportError("Food.com recipe source ID must be positive decimal ID.");
  const name = text(row.name, "recipe name", 10_000).trim();
  if (!name) throw new FoodComImportError("Recipe source name is empty.");
  const description = row.description === null ? null : text(row.description, "recipe description", 100_000);
  const submitted = row.submittedAt;
  let submittedAt: Date | null = null;
  if (submitted !== null) {
    if (typeof submitted !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(submitted)) {
      throw new FoodComImportError("Recipe submitted date must use YYYY-MM-DD.");
    }
    submittedAt = new Date(`${submitted}T00:00:00.000Z`);
    if (Number.isNaN(submittedAt.getTime()) || submittedAt.toISOString().slice(0, 10) !== submitted) {
      throw new FoodComImportError("Recipe submitted date is invalid.");
    }
  }
  if (row.foodCode !== `FOODCOM-${sourceId}` || row.category !== null || row.taste !== null || row.origin !== null || row.imageUrl !== null) {
    throw new FoodComImportError("Food.com export must not invent recipe categories, taste, origin, or images.");
  }
  const nutrition = numberArray(row.nutrition, "nutrition");
  if (nutrition.length !== 7) throw new FoodComImportError("Food.com nutrition must contain seven source values.");
  return {
    foodCode: `FOODCOM-${sourceId}`,
    sourceDataset: "FOODCOM",
    sourceId,
    sourceVersion,
    name,
    description,
    category: null,
    taste: null,
    origin: null,
    imageUrl: null,
    minutes: nullableCount(row.minutes, "minutes"),
    submittedAt,
    nSteps: nullableCount(row.nSteps, "nSteps"),
    nIngredients: nullableCount(row.nIngredients, "nIngredients"),
    tags: stringArray(row.tags, "tags"),
    nutrition,
    steps: stringArray(row.steps, "steps"),
    ingredients: stringArray(row.ingredients, "ingredients"),
  };
}

function readRatings(buffer: Buffer, recipeIds: Set<string>, minUserTrain: number, userLimit: number) {
  if (buffer.byteLength > MAX_RATING_FILE_BYTES) throw new FoodComImportError("Food.com ratings file exceeds 20 MiB limit.");
  let rows: JsonRecord[];
  try {
    rows = parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer), {
      bom: true,
      columns: (headers: string[]) => {
        if (headers.length !== 3 || headers[0] !== "source_user_id" || headers[1] !== "source_recipe_id" || headers[2] !== "rating") {
          throw new Error("Historical ratings header must contain source IDs and rating only.");
        }
        return headers;
      },
      skip_empty_lines: false, relax_column_count: false, relax_quotes: false, trim: true,
    }) as JsonRecord[];
  } catch {
    throw new FoodComImportError("Food.com historical ratings CSV is invalid UTF-8 or malformed.");
  }
  if (rows.length === 0 || rows.length > MAX_RATINGS) throw new FoodComImportError("Food.com historical rating count is outside worker limits.");
  const pairs = new Set<string>();
  const users = new Set<string>();
  const ratingsPerUser = new Map<string, number>();
  const ratings: Array<{ sourceUserId: bigint; sourceRecipeId: string; rating: number }> = [];
  for (const row of rows) {
    const userId = row.source_user_id;
    const recipeId = row.source_recipe_id;
    const rating = typeof row.rating === "string" && /^[1-5]$/.test(row.rating) ? Number(row.rating) : 0;
    if (typeof userId !== "string" || !/^[1-9]\d*$/.test(userId) || typeof recipeId !== "string" || !recipeIds.has(recipeId) || !rating) {
      throw new FoodComImportError("Food.com historical ratings must contain source IDs and explicit ratings 1–5 only.");
    }
    const sourceUserId = BigInt(userId);
    if (sourceUserId > BigInt(Number.MAX_SAFE_INTEGER)) throw new FoodComImportError("Food.com source user IDs exceed snapshot integer range.");
    const pair = `${userId}:${recipeId}`;
    if (pairs.has(pair)) throw new FoodComImportError("Food.com historical ratings contain a duplicate user-recipe pair.");
    pairs.add(pair);
    users.add(userId);
    ratingsPerUser.set(userId, (ratingsPerUser.get(userId) ?? 0) + 1);
    ratings.push({ sourceUserId, sourceRecipeId: recipeId, rating });
  }
  if (users.size > userLimit || [...ratingsPerUser.values()].some((count) => count < minUserTrain)) {
    throw new FoodComImportError("Food.com users violate declared cap or minimum training history.");
  }
  return { ratings, userCount: users.size };
}

export async function importFoodComCatalog(exportDir: string) {
  const root = path.resolve(exportDir);
  let manifest: JsonRecord;
  let manifestBuffer: Buffer;
  let recipesBuffer: Buffer;
  let ratingsBuffer: Buffer;
  try {
    const sizes = await Promise.all(["manifest.json", "recipes.jsonl", "historical_ratings.csv"].map(async (name) => (await stat(path.join(root, name))).size));
    if (sizes[0]! > MAX_MANIFEST_BYTES || sizes[1]! > MAX_RECIPE_FILE_BYTES || sizes[2]! > MAX_RATING_FILE_BYTES) {
      throw new FoodComImportError("Food.com export bundle exceeds file-size safety limits.");
    }
  } catch (error) {
    if (error instanceof FoodComImportError) throw error;
    throw new FoodComImportError("Food.com export bundle is incomplete.");
  }
  try {
    [manifestBuffer, recipesBuffer, ratingsBuffer] = await Promise.all([
      readFile(path.join(root, "manifest.json")),
      readFile(path.join(root, "recipes.jsonl")),
      readFile(path.join(root, "historical_ratings.csv")),
    ]);
    manifest = record(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifestBuffer))) ?? {};
  } catch {
    throw new FoodComImportError("Food.com export bundle is incomplete or invalid JSON.");
  }
  if (manifest.schemaVersion !== 1) throw new FoodComImportError("Unsupported Food.com export manifest version.");
  const source = record(manifest.source);
  const sampling = record(manifest.sampling);
  const counts = record(manifest.counts);
  const artifacts = record(manifest.artifacts);
  if (!source || !sampling || !counts || !artifacts) throw new FoodComImportError("Food.com export manifest is incomplete.");
  const sourceVersion = text(source.releaseLabel, "source release", 80);
  const sourceUrl = text(source.url, "source URL", 300);
  if (sourceUrl !== "https://www.kaggle.com/datasets/shuyangli94/food-com-recipes-and-user-interactions") {
    throw new FoodComImportError("Food.com source URL does not match approved dataset provenance.");
  }
  const rightsReviewReference = text(source.rightsReviewReference, "rights review reference", 160);
  const preparedManifestSha256 = text(source.preparedManifestSha256, "prepared manifest checksum", 64);
  if (!/^[a-f0-9]{64}$/.test(preparedManifestSha256)) throw new FoodComImportError("Prepared manifest checksum is invalid.");
  const rawRecipesSha256 = text(source.rawRecipesSha256, "RAW_recipes checksum", 64);
  if (!/^[a-f0-9]{64}$/.test(rawRecipesSha256)) throw new FoodComImportError("RAW_recipes checksum is invalid.");
  const samplingStrategy = text(sampling.strategy, "sampling strategy", 40);
  const seed = positiveInteger(sampling.seed, "sampling seed", 2_147_483_647);
  const userLimit = positiveInteger(sampling.userLimit, "user limit", MAX_USERS);
  let minimumUserHistory: number;
  if (samplingStrategy === "user_history") {
    const minUserTrain = positiveInteger(sampling.minUserTrain, "minimum training history");
    if (seed !== 20_261_113 || minUserTrain < 5) {
      throw new FoodComImportError("Importer requires prespecified user_history sampling with at least five training ratings per user.");
    }
    minimumUserHistory = minUserTrain;
  } else if (samplingStrategy === "k_core") {
    const coreK = positiveInteger(sampling.coreK, "k-core threshold", 10);
    if (seed !== 20_261_113 || coreK !== 10) {
      throw new FoodComImportError("Importer requires prespecified k_core sampling with coreK=10.");
    }
    minimumUserHistory = coreK;
  } else {
    throw new FoodComImportError("Importer requires prespecified user_history or k_core sampling.");
  }
  const expectedCounts = {
    users: positiveInteger(counts.users, "user count", MAX_USERS),
    recipes: positiveInteger(counts.recipes, "recipe count", MAX_RECIPES),
    ratings: positiveInteger(counts.ratings, "rating count", MAX_RATINGS),
  };
  if (expectedCounts.users > userLimit) throw new FoodComImportError("Food.com user count exceeds declared subset cap.");
  for (const [name, buffer] of [["recipes.jsonl", recipesBuffer], ["historical_ratings.csv", ratingsBuffer]] as const) {
    const artifact = record(artifacts[name]);
    if (!artifact || artifact.sha256 !== digest(buffer)) throw new FoodComImportError(`Food.com export checksum mismatch: ${name}.`);
  }

  let recipeText: string;
  try {
    recipeText = new TextDecoder("utf-8", { fatal: true }).decode(recipesBuffer);
  } catch {
    throw new FoodComImportError("Food.com recipe JSONL is not valid UTF-8.");
  }
  const recipeLines = recipeText.split(/\r?\n/).filter((line) => line.length > 0);
  if (recipeLines.length !== expectedCounts.recipes) throw new FoodComImportError("Food.com recipe count does not match export manifest.");
  const recipes = recipeLines.map((line) => {
    try {
      return readRecipe(JSON.parse(line), sourceVersion);
    } catch (error) {
      if (error instanceof FoodComImportError) throw error;
      throw new FoodComImportError("Food.com recipe JSONL contains invalid JSON.");
    }
  });
  const recipeIds = new Set(recipes.map(({ sourceId }) => sourceId));
  if (recipeIds.size !== recipes.length) throw new FoodComImportError("Food.com recipe IDs must be unique.");
  const { ratings, userCount } = readRatings(ratingsBuffer, recipeIds, minimumUserHistory, userLimit);
  const ratedRecipeCount = new Set(ratings.map(({ sourceRecipeId }) => sourceRecipeId)).size;
  if (ratedRecipeCount !== recipes.length) throw new FoodComImportError("Food.com catalog includes recipes without training ratings.");
  if (userCount !== expectedCounts.users || ratings.length !== expectedCounts.ratings) {
    throw new FoodComImportError("Food.com historical rating counts do not match export manifest.");
  }

  const manifestSha256 = digest(manifestBuffer);
  const imported = await prisma.$transaction(async (tx) => {
    const catalogImport = await tx.foodCatalogImport.upsert({
      where: { manifestSha256 },
      create: {
        sourceDataset: "FOODCOM",
        sourceVersion,
        sourceUrl,
        rightsReviewReference,
        preparedManifestSha256,
        manifestSha256,
        samplingStrategy,
        seed,
        userCount,
        recipeCount: recipes.length,
        ratingCount: ratings.length,
      },
      update: {},
      select: { id: true, userCount: true, recipeCount: true, ratingCount: true },
    });
    if (catalogImport.userCount !== userCount || catalogImport.recipeCount !== recipes.length || catalogImport.ratingCount !== ratings.length) {
      throw new FoodComImportError("Existing Food.com import manifest has conflicting counts.");
    }

    const foodIds = new Map<string, number>();
    for (const recipe of recipes) {
      const { tags, nutrition, steps, ingredients, ...fields } = recipe;
      const importedFood = await tx.food.upsert({
        where: { sourceDataset_sourceId: { sourceDataset: "FOODCOM", sourceId: recipe.sourceId } },
        create: {
          ...fields,
          sourceImportId: catalogImport.id,
          tags: tags as Prisma.InputJsonArray,
          nutrition: nutrition as Prisma.InputJsonArray,
          steps: steps as Prisma.InputJsonArray,
          ingredients: ingredients as Prisma.InputJsonArray,
        },
        update: {
          foodCode: recipe.foodCode,
          sourceVersion,
          sourceImportId: catalogImport.id,
          name: recipe.name,
          description: recipe.description,
          category: null,
          taste: null,
          healthLevel: null,
          origin: null,
          proteinType: null,
          priceCategory: null,
          mealTime: null,
          dietCategory: null,
          texture: null,
          imageUrl: null,
          minutes: recipe.minutes,
          submittedAt: recipe.submittedAt,
          nSteps: recipe.nSteps,
          nIngredients: recipe.nIngredients,
          tags: tags as Prisma.InputJsonArray,
          nutrition: nutrition as Prisma.InputJsonArray,
          steps: steps as Prisma.InputJsonArray,
          ingredients: ingredients as Prisma.InputJsonArray,
          isActive: true,
        },
        select: { id: true },
      });
      foodIds.set(recipe.sourceId, importedFood.id);
    }

    for (let offset = 0; offset < ratings.length; offset += IMPORT_CHUNK_SIZE) {
      await tx.historicalRating.createMany({
        data: ratings.slice(offset, offset + IMPORT_CHUNK_SIZE).map(({ sourceUserId, sourceRecipeId, rating }) => ({
          importId: catalogImport.id,
          sourceUserId,
          foodId: foodIds.get(sourceRecipeId)!,
          rating,
        })),
        skipDuplicates: true,
      });
    }

    await tx.foodCatalogImport.updateMany({ where: { sourceDataset: "FOODCOM", isActive: true, id: { not: catalogImport.id } }, data: { isActive: false } });
    await tx.food.updateMany({ where: { sourceDataset: "FOODCOM", isActive: true, sourceImportId: { not: catalogImport.id } }, data: { isActive: false } });
    await tx.foodCatalogImport.update({ where: { id: catalogImport.id }, data: { isActive: true } });
    return { importId: catalogImport.id, users: userCount, recipes: recipes.length, ratings: ratings.length };
  }, { maxWait: 10_000, timeout: 120_000 });

  return imported;
}
