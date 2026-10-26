import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { MAX_FOOD_IMAGE_BYTES } from "@/lib/food/constants";
import { readApplicationEnvironment } from "@/lib/env";

const managedImagePrefix = "/api/food-images/";
const jpegSignature = Buffer.from([0xff, 0xd8, 0xff]);
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export class FoodImageValidationError extends Error {}

function storageRoot() {
  const { FOODREC_STORAGE_DIR } = readApplicationEnvironment();
  if (!FOODREC_STORAGE_DIR) return path.join(process.cwd(), "storage");
  if (path.isAbsolute(FOODREC_STORAGE_DIR)) return FOODREC_STORAGE_DIR;
  return path.join(process.cwd(), "storage", FOODREC_STORAGE_DIR);
}

function imageDirectory() {
  return path.join(storageRoot(), "food-images");
}

function importDirectory() {
  return path.join(storageRoot(), "food-imports");
}

function ratingExportDirectory() {
  return path.join(storageRoot(), "rating-exports");
}

function recommendationImportDirectory() {
  return path.join(storageRoot(), "recommendation-imports");
}

function inspectImage(buffer: Buffer): { mime: string; extension: string } | null {
  if (buffer.length >= 3 && buffer.subarray(0, 3).equals(jpegSignature)) return { mime: "image/jpeg", extension: ".jpg" };
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(pngSignature)) return { mime: "image/png", extension: ".png" };
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return { mime: "image/webp", extension: ".webp" };
  }
  return null;
}

function imageName(value: string) {
  if (!value.startsWith(managedImagePrefix)) return null;
  const name = value.slice(managedImagePrefix.length);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/.test(name) ? name : null;
}

export async function saveFoodImage(file: File) {
  if (file.size === 0 || file.size > MAX_FOOD_IMAGE_BYTES) throw new FoodImageValidationError("Ukuran foto harus antara 1 byte dan 5 MB.");
  const buffer = Buffer.from(await file.arrayBuffer());
  const detected = inspectImage(buffer);
  if (!detected || detected.mime !== file.type) throw new FoodImageValidationError("Isi file tidak cocok dengan format JPEG, PNG, atau WebP.");

  const extension = path.extname(file.name).toLowerCase();
  const extensionMatches = detected.mime === "image/jpeg" ? [".jpg", ".jpeg"].includes(extension) : extension === detected.extension;
  if (!extensionMatches) throw new FoodImageValidationError("Ekstensi file tidak cocok dengan format gambar.");

  const filename = `${randomUUID()}${detected.extension}`;
  const directory = imageDirectory();
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, filename), buffer, { flag: "wx" });
  return { imageUrl: `${managedImagePrefix}${filename}`, filename };
}

export async function removeFoodImage(imageUrl: string | null | undefined) {
  if (!imageUrl) return;
  const filename = imageName(imageUrl);
  if (!filename) return;
  try {
    await unlink(path.join(imageDirectory(), filename));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function readFoodImage(filename: string) {
  if (!imageName(`${managedImagePrefix}${filename}`)) return null;
  try {
    const buffer = await readFile(path.join(imageDirectory(), filename));
    const detected = inspectImage(buffer);
    return detected ? { buffer, mime: detected.mime } : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function csvDraftName(stagingKey: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(stagingKey)) {
    throw new Error("Invalid import staging key.");
  }
  return `${stagingKey}.csv`;
}

export async function saveCsvDraft(stagingKey: string, buffer: Buffer) {
  const directory = importDirectory();
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, csvDraftName(stagingKey)), buffer, { flag: "wx" });
}

export async function readCsvDraft(stagingKey: string) {
  return readFile(path.join(importDirectory(), csvDraftName(stagingKey)));
}

export async function removeCsvDraft(stagingKey: string) {
  try {
    await unlink(path.join(importDirectory(), csvDraftName(stagingKey)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function ratingExportKey(key: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.csv$/.test(key)) {
    throw new Error("Invalid dataset export key.");
  }
  return key;
}

export async function saveRatingExport(buffer: Buffer) {
  const key = `${randomUUID()}.csv`;
  const directory = ratingExportDirectory();
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, key), buffer, { flag: "wx" });
  return key;
}

export async function readRatingExport(key: string) {
  return readFile(path.join(ratingExportDirectory(), ratingExportKey(key)));
}

export async function removeRatingExport(key: string) {
  try {
    await unlink(path.join(ratingExportDirectory(), ratingExportKey(key)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function recommendationImportName(key: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.csv$/.test(key)) {
    throw new Error("Invalid recommendation import key.");
  }
  return key;
}

export async function saveRecommendationImport(buffer: Buffer) {
  const key = `${randomUUID()}.csv`;
  const directory = recommendationImportDirectory();
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, key), buffer, { flag: "wx" });
  return key;
}

export async function readRecommendationImport(key: string) {
  return readFile(path.join(recommendationImportDirectory(), recommendationImportName(key)));
}

export async function removeRecommendationImport(key: string) {
  try {
    await unlink(path.join(recommendationImportDirectory(), recommendationImportName(key)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
