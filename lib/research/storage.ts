import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { readApplicationEnvironment } from "@/lib/env";

function exportDirectory() {
  const { FOODREC_STORAGE_DIR } = readApplicationEnvironment();
  const root = FOODREC_STORAGE_DIR
    ? path.isAbsolute(FOODREC_STORAGE_DIR) ? FOODREC_STORAGE_DIR : path.join(process.cwd(), "storage", FOODREC_STORAGE_DIR)
    : path.join(process.cwd(), "storage");
  return path.join(root, "research-exports");
}

function checkedKey(key: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.csv$/.test(key)) throw new Error("Invalid research export key.");
  return key;
}

export async function saveResearchExport(buffer: Buffer) {
  const key = `${randomUUID()}.csv`;
  const directory = exportDirectory();
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, key), buffer, { flag: "wx" });
  return key;
}

export async function readResearchExport(key: string) {
  return readFile(path.join(exportDirectory(), checkedKey(key)));
}

export async function removeResearchExport(key: string) {
  try {
    await unlink(path.join(exportDirectory(), checkedKey(key)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
