import * as rspack from '@rspack/core';

import { defineConfig } from '@rslib/core';

export default defineConfig({
  lib: [
    {
      format: 'cjs',
      bundle: true,
      dts: false,
      source: {
        entry: { index: './src/preload/index.ts' },
      },
      output: {
        distPath: { root: './lib/preload' },
        filename: { js: 'index.cjs' },
        target: 'node',
        // === PRODUCTION OPTIMIZATIONS ===
        minify: true,
        sourceMap: false,
      },
      tools: {
        bundlerChain(chain) {
          chain.target('electron-preload');
        },
        rspack(config) {
          // === OPTIMIZATION FLAGS ===
          config.optimization = {
            minimize: true,
            usedExports: true,
            sideEffects: true,
            concatenateModules: true,
            innerGraph: true,
            minimizer: [
              new rspack.SwcJsMinimizerRspackPlugin({
                minimizerOptions: {
                  compress: {
                    drop_console: true,
                  },
                },
              }),
            ],
          };

          // CRITICAL: electron must never be bundled in preload
          const existing = config.externals ?? [];
          const arr = Array.isArray(existing) ? existing : [existing];
          arr.push(function(ctx, callback) {
            const req = ctx.request ?? '';
            if (req === 'electron' || req.startsWith('electron/')) {
              return callback(undefined, `commonjs ${req}`);
            }
            callback();
          });
          config.externals = arr;
          // Configure extension alias for TypeScript imports
          config.resolve = config.resolve ?? {};
          config.resolve.extensionAlias = { '.js': ['.ts', '.js'] };
          return config;
      },
    },
  },
],
  source: {
    tsconfigPath: './src/preload/tsconfig.json',
  },
});
