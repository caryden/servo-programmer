import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptDir, "..");
const repoRoot = resolve(webRoot, "..", "..");
const sourceDir = join(repoRoot, "downloads");
const targetDir = join(webRoot, "downloads");

if (existsSync(targetDir)) {
  rmSync(targetDir, { recursive: true, force: true });
}
mkdirSync(targetDir, { recursive: true });

if (!existsSync(sourceDir) || !statSync(sourceDir).isDirectory()) {
  console.warn(`downloads directory not found: ${sourceDir}; continuing with empty web downloads/`);
  process.exit(0);
}

for (const entry of readdirSync(sourceDir)) {
  if (!entry.toLowerCase().endsWith(".sfw")) {
    continue;
  }
  cpSync(join(sourceDir, entry), join(targetDir, entry), { recursive: true });
}

console.log(`Synced downloads -> ${targetDir}`);
