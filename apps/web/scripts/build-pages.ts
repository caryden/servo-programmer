import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptDir, "..");
const siteRoot = join(webRoot, ".pages");

rmSync(siteRoot, { recursive: true, force: true });
mkdirSync(siteRoot, { recursive: true });

const requiredPaths = ["index.html", "favicon.ico", "favicon.png", "dist", "downloads"];
for (const relativePath of requiredPaths) {
  const sourcePath = join(webRoot, relativePath);
  if (!existsSync(sourcePath)) {
    throw new Error(`Required Pages asset is missing: ${sourcePath}`);
  }
  cpSync(sourcePath, join(siteRoot, relativePath), { recursive: true });
}

writeFileSync(join(siteRoot, ".nojekyll"), "");

console.log(`Prepared GitHub Pages bundle -> ${siteRoot}`);
