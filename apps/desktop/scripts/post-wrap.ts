import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const wrapperBundlePath = process.env.ELECTROBUN_WRAPPER_BUNDLE_PATH;
const appVersion = process.env.ELECTROBUN_APP_VERSION;
const targetOs = process.env.ELECTROBUN_OS;

if (!wrapperBundlePath || !appVersion || targetOs !== "macos") {
  process.exit(0);
}

const infoPlistPath = join(wrapperBundlePath, "Contents", "Info.plist");
const original = readFileSync(infoPlistPath, "utf8");

if (original.includes("CFBundleShortVersionString")) {
  process.exit(0);
}

const replacement = [
  "<key>CFBundleVersion</key>",
  `    <string>${appVersion}</string>`,
  "    <key>CFBundleShortVersionString</key>",
  `    <string>${appVersion}</string>`,
].join("\n");

const updated = original.replace(
  /<key>CFBundleVersion<\/key>\s*<string>.*?<\/string>/,
  replacement,
);

if (updated === original) {
  throw new Error(`Could not patch ${infoPlistPath} with CFBundleShortVersionString`);
}

writeFileSync(infoPlistPath, updated);
