import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = {
  ...process.env,
  NODE_PATH: [path.join(root, "node_modules", "next", "dist", "compiled"), process.env.NODE_PATH]
    .filter(Boolean)
    .join(path.delimiter)
};
const result = spawnSync(process.execPath, [
  "--conditions=react-server",
  "--import",
  "tsx",
  path.join(root, "scripts", "import-foodcom-catalog.ts"),
  ...process.argv.slice(2)
], { cwd: root, env, stdio: "inherit", windowsHide: true });

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
