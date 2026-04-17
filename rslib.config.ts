import { defineConfig } from "@rslib/core";
import { createElectronLibConfig } from "./rslib.config.base.js";

export default defineConfig({
  lib: [
    createElectronLibConfig({
      entry: { index: "./src/main/index.ts" },
      distRoot: "./lib/main",
      filename: "[name].cjs",
      electronTarget: "electron-main",
      tsconfigPath: "./src/main/tsconfig.json",
    }),
  ],
  source: {
    tsconfigPath: "./src/main/tsconfig.json",
  },
});
