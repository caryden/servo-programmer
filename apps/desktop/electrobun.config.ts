import { readFileSync } from "node:fs";
import type { ElectrobunConfig } from "electrobun";

const cliPackage = JSON.parse(
  readFileSync(new URL("../cli/package.json", import.meta.url), "utf8"),
) as { version?: string };
const appVersion = cliPackage.version ?? "0.0.1";

export default {
  app: {
    name: "Axon Servo Programmer",
    identifier: "com.caryden.axon.servo-programmer",
    version: appVersion,
  },
  build: {
    views: {
      mainview: {
        entrypoint: "src/mainview/index.ts",
      },
    },
    copy: {
      "src/mainview/index.html": "views/mainview/index.html",
      "src/mainview/index.css": "views/mainview/index.css",
      "../../downloads": "downloads",
    },
    mac: {
      icons: "icon.iconset",
      bundleCEF: false,
    },
    linux: {
      icon: "assets/icon.png",
      bundleCEF: false,
    },
    win: {
      bundleCEF: false,
    },
  },
  scripts: {
    postWrap: "./scripts/post-wrap.ts",
  },
} satisfies ElectrobunConfig;
