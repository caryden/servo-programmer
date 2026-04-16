import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptDir, "..");
const repoRoot = resolve(webRoot, "..", "..");
const sourceDir = join(repoRoot, "downloads");
const targetDir = join(webRoot, "downloads");

if (!existsSync(sourceDir) || !statSync(sourceDir).isDirectory()) {
  throw new Error(`downloads directory not found: ${sourceDir}`);
}

if (existsSync(targetDir)) {
  rmSync(targetDir, { recursive: true, force: true });
}
mkdirSync(targetDir, { recursive: true });

for (const entry of readdirSync(sourceDir)) {
  cpSync(join(sourceDir, entry), join(targetDir, entry), { recursive: true });
}

console.log(`Synced downloads -> ${targetDir}`);
