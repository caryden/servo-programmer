import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import {
  defaultFirmwareCacheDir,
  firmwareResolutionHint,
  firmwareSearchDirs,
  resolveCatalogFirmware,
} from "../src/firmware-store.ts";

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("firmware search paths", () => {
  test("orders AXON_FIRMWARE_PATH before cache", () => {
    const dirs = firmwareSearchDirs({
      env: {
        AXON_FIRMWARE_PATH: `/tmp/one${delimiter}/tmp/two`,
        AXON_FIRMWARE_CACHE: "/tmp/cache",
        HOME: "/tmp/home",
      },
      includeDevDownloads: false,
    });

    expect(dirs[0]).toEqual({ source: "env", path: resolve("/tmp/one") });
    expect(dirs[1]).toEqual({ source: "env", path: resolve("/tmp/two") });
    expect(dirs[2]).toEqual({ source: "user_cache", path: resolve("/tmp/cache") });
  });

  test("uses platform-specific user cache locations", () => {
    expect(defaultFirmwareCacheDir({ HOME: "/Users/test" }, "darwin")).toBe(
      join("/Users/test", "Library", "Application Support", "axon", "firmware"),
    );
    expect(defaultFirmwareCacheDir({ HOME: "/home/test" }, "linux")).toBe(
      join("/home/test", ".local", "share", "axon", "firmware"),
    );
    const winCache = defaultFirmwareCacheDir(
      { LOCALAPPDATA: "C:\\Users\\test\\AppData\\Local" },
      "win32",
    );
    expect(winCache).toContain("Axon");
    expect(winCache).toContain("firmware");
  });
});

describe("resolveCatalogFirmware", () => {
  test("returns bytes only when filename and SHA-256 match", () => {
    const tmp = mkdtempSync(join(tmpdir(), "axon-fw-"));
    try {
      const bytes = Buffer.from("firmware bytes");
      writeFileSync(join(tmp, "Example.sfw"), bytes);

      const result = resolveCatalogFirmware(
        {
          file: "Example.sfw",
          sha256: sha256(bytes),
          description: "test firmware",
        },
        {
          env: { AXON_FIRMWARE_PATH: tmp, HOME: "/tmp/home" },
          cacheDir: null,
          includeDevDownloads: false,
        },
      );

      expect(result.found).toBe(true);
      if (result.found) {
        expect(result.source).toBe("env");
        expect(result.path).toBe(join(tmp, "Example.sfw"));
        expect(result.bytes.equals(bytes)).toBe(true);
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("reports hash mismatches without returning untrusted bytes", () => {
    const tmp = mkdtempSync(join(tmpdir(), "axon-fw-"));
    try {
      writeFileSync(join(tmp, "Example.sfw"), "wrong bytes");

      const result = resolveCatalogFirmware(
        {
          file: "Example.sfw",
          sha256: sha256(Buffer.from("right bytes")),
          description: "test firmware",
        },
        {
          env: { AXON_FIRMWARE_PATH: tmp, HOME: "/tmp/home" },
          cacheDir: null,
          includeDevDownloads: false,
        },
      );

      expect(result.found).toBe(false);
      if (!result.found) {
        expect(result.reason).toBe("hash_mismatch");
        expect(result.mismatches).toHaveLength(1);
        expect(
          firmwareResolutionHint({ file: "Example.sfw", sha256: "", description: "" }, result),
        ).toContain("SHA-256 did not match");
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
