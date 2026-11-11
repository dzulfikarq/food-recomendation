import path from "node:path";

function isInside(parent: string, target: string) {
  const relative = path.relative(parent, target);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export function resolveResearchExportDirectory(storageDir: string | undefined, workingDirectory: string, production: boolean) {
  if (production && (!storageDir || !path.isAbsolute(storageDir))) {
    throw new Error("Production research exports require an absolute FOODREC_STORAGE_DIR.");
  }

  const root = storageDir
    ? path.isAbsolute(storageDir) ? storageDir : path.resolve(workingDirectory, "storage", storageDir)
    : path.resolve(workingDirectory, "storage");
  const directory = path.resolve(root, "research-exports");
  const publicDirectory = path.resolve(workingDirectory, "public");
  if (isInside(publicDirectory, directory)) throw new Error("Research exports cannot be stored inside the public directory.");
  return directory;
}

export function assertResearchExportDirectoryIsPrivate(directory: string, publicDirectory: string) {
  if (isInside(path.resolve(publicDirectory), path.resolve(directory))) {
    throw new Error("Research exports cannot be stored inside the public directory.");
  }
}
