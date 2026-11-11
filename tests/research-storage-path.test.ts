import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { assertResearchExportDirectoryIsPrivate, resolveResearchExportDirectory } from "@/lib/research/storage-path";

test("research export storage rejects production-relative and public paths", () => {
  const root = path.resolve("C:/foodrec");
  assert.throws(() => resolveResearchExportDirectory(undefined, root, true), /absolute FOODREC_STORAGE_DIR/);
  assert.throws(() => resolveResearchExportDirectory("exports", root, true), /absolute FOODREC_STORAGE_DIR/);
  assert.throws(() => resolveResearchExportDirectory(path.join(root, "public"), root, true), /public directory/);
  assert.throws(() => resolveResearchExportDirectory("../public", root, false), /public directory/);
  assert.equal(resolveResearchExportDirectory(path.join(root, "private-storage"), root, true), path.join(root, "private-storage", "research-exports"));
  assert.throws(() => assertResearchExportDirectoryIsPrivate(path.join(root, "storage", "research-exports"), path.join(root, "storage")), /public directory/);
});
