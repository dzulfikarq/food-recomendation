import { randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { readApplicationEnvironment } from "@/lib/env";
import { assertResearchExportDirectoryIsPrivate, resolveResearchExportDirectory } from "@/lib/research/storage-path";

async function exportDirectory() {
  const { FOODREC_STORAGE_DIR } = readApplicationEnvironment();
  const directory = resolveResearchExportDirectory(
    FOODREC_STORAGE_DIR,
    process.cwd(),
    process.env.NODE_ENV === "production" && !process.env.FOODREC_TEST_RUN
  );
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") await chmod(directory, 0o700);
  const publicDirectory = path.resolve(process.cwd(), "public");
  const [realDirectory, realPublicDirectory] = await Promise.all([
    realpath(directory),
    realpath(publicDirectory).catch(async (error) => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const publicDirectoryExists = await lstat(publicDirectory).then(() => true, (statError: NodeJS.ErrnoException) => {
        if (statError.code === "ENOENT") return false;
        throw statError;
      });
      if (publicDirectoryExists) throw error;
      return publicDirectory;
    })
  ]);
  assertResearchExportDirectoryIsPrivate(realDirectory, realPublicDirectory);
  return realDirectory;
}

function checkedKey(key: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.csv$/.test(key)) throw new Error("Invalid research export key.");
  return key;
}

export async function saveResearchExport(buffer: Buffer) {
  const key = `${randomUUID()}.csv`;
  const directory = await exportDirectory();
  await writeFile(path.join(directory, key), buffer, { flag: "wx", mode: 0o600 });
  return key;
}

export async function readResearchExport(key: string) {
  return readFile(path.join(await exportDirectory(), checkedKey(key)));
}

export async function removeResearchExport(key: string) {
  try {
    await unlink(path.join(await exportDirectory(), checkedKey(key)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
