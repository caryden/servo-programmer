/**
 * Locate user-supplied Axon `.sfw` firmware files.
 *
 * We intentionally do not ship vendor firmware inside the CLI. The
 * catalog records expected filenames and SHA-256 values; this module
 * finds matching files in user-controlled locations and verifies them
 * before the flash code sees any bytes.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { BundledFirmware } from "./catalog.ts";
import { toUint8Array } from "./util/bytes.ts";

export const FIRMWARE_DOWNLOAD_URL = "https://docs.axon-robotics.com/archive/programmer";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const DEV_DOWNLOADS_DIR = join(REPO_ROOT, "downloads");

export type FirmwareSource = "env" | "user_cache" | "dev_downloads";

export interface FirmwareSearchDir {
  source: FirmwareSource;
  path: string;
}

export interface FirmwareResolved {
  found: true;
  source: FirmwareSource;
  path: string;
  bytes: Buffer;
  sha256: string;
}

export interface FirmwareCandidateMismatch {
  source: FirmwareSource;
  path: string;
  sha256: string;
}

export interface FirmwareNotFound {
  found: false;
  reason: "not_found" | "hash_mismatch";
  searched: FirmwareSearchDir[];
  mismatches: FirmwareCandidateMismatch[];
}

export type FirmwareResolution = FirmwareResolved | FirmwareNotFound;

interface FirmwareSearchOptions {
  env?: Record<string, string | undefined>;
  cacheDir?: string | null;
  includeDevDownloads?: boolean;
}

function sha256Hex(bytes: ArrayLike<number>): string {
  return createHash("sha256").update(toUint8Array(bytes)).digest("hex");
}

function pushUnique(
  dirs: FirmwareSearchDir[],
  seen: Set<string>,
  source: FirmwareSource,
  path: string,
): void {
  const normalized = resolve(path);
  if (seen.has(normalized)) return;
  seen.add(normalized);
  dirs.push({ source, path: normalized });
}

export function defaultFirmwareCacheDir(
  env: Record<string, string | undefined> = process.env,
  platformName = process.platform,
): string | null {
  if (env.AXON_FIRMWARE_CACHE && env.AXON_FIRMWARE_CACHE.length > 0) {
    return env.AXON_FIRMWARE_CACHE;
  }

  const home = env.HOME ?? homedir();
  if (platformName === "darwin") {
    return join(home, "Library", "Application Support", "axon", "firmware");
  }
  if (platformName === "win32") {
    const base = env.LOCALAPPDATA ?? env.APPDATA ?? join(home, "AppData", "Local");
    return join(base, "Axon", "firmware");
  }

  const dataHome = env.XDG_DATA_HOME ?? join(home, ".local", "share");
  return join(dataHome, "axon", "firmware");
}

export function firmwareSearchDirs(options: FirmwareSearchOptions = {}): FirmwareSearchDir[] {
  const env = options.env ?? process.env;
  const dirs: FirmwareSearchDir[] = [];
  const seen = new Set<string>();

  for (const path of (env.AXON_FIRMWARE_PATH ?? "").split(delimiter)) {
    if (path.length > 0) pushUnique(dirs, seen, "env", path);
  }

  const cacheDir = options.cacheDir === undefined ? defaultFirmwareCacheDir(env) : options.cacheDir;
  if (cacheDir !== null) pushUnique(dirs, seen, "user_cache", cacheDir);

  if (options.includeDevDownloads !== false && existsSync(DEV_DOWNLOADS_DIR)) {
    pushUnique(dirs, seen, "dev_downloads", DEV_DOWNLOADS_DIR);
  }

  return dirs;
}

export function resolveCatalogFirmware(
  entry: BundledFirmware,
  options: FirmwareSearchOptions = {},
): FirmwareResolution {
  const searched = firmwareSearchDirs(options);
  const mismatches: FirmwareCandidateMismatch[] = [];
  const expected = entry.sha256.toLowerCase();

  for (const dir of searched) {
    const candidatePath = join(dir.path, entry.file);
    if (!existsSync(candidatePath)) continue;

    const bytes = readFileSync(candidatePath);
    const actual = sha256Hex(bytes);
    if (actual.toLowerCase() === expected) {
      return {
        found: true,
        source: dir.source,
        path: candidatePath,
        bytes,
        sha256: actual,
      };
    }
    mismatches.push({ source: dir.source, path: candidatePath, sha256: actual });
  }

  return {
    found: false,
    reason: mismatches.length > 0 ? "hash_mismatch" : "not_found",
    searched,
    mismatches,
  };
}

export function firmwareResolutionHint(
  entry: BundledFirmware,
  resolution: FirmwareNotFound,
): string {
  const lines = [
    `Download ${entry.file} from ${FIRMWARE_DOWNLOAD_URL}, then either pass --file <path.sfw> or place it in a firmware search directory.`,
    "Search directories:",
  ];

  for (const dir of resolution.searched) {
    lines.push(`  - ${dir.path} (${dir.source})`);
  }

  if (resolution.mismatches.length > 0) {
    lines.push(
      "Files with the expected name were found, but their SHA-256 did not match the catalog:",
    );
    for (const mismatch of resolution.mismatches) {
      lines.push(`  - ${mismatch.path} (${mismatch.sha256})`);
    }
  }

  return lines.join("\n");
}
