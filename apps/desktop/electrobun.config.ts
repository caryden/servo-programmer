import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Axon Servo Programmer",
    identifier: "com.caryden.axon.servo-programmer",
    version: "0.0.1",
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
} satisfies ElectrobunConfig;
