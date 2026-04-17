import { defineConfig } from "@rslib/core";
import { createElectronLibConfig } from "./rslib.config.base.js";

export default defineConfig({
  lib: [
    // CRITICAL: electron and runtime dependencies must never be bundled in preload
    createElectronLibConfig({
      entry: { index: "./src/preload/index.ts" },
      distRoot: "./lib/preload",
      filename: "index.cjs",
      electronTarget: "electron-preload",
      tsconfigPath: "./src/preload/tsconfig.json",
    }),
  ],
  source: {
    tsconfigPath: "./src/preload/tsconfig.json",
  },
});
