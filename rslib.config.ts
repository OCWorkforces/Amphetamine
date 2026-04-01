import * as rspack from '@rspack/core';
import { defineConfig } from '@rslib/core';

const isDev = process.env.NODE_ENV !== 'production';

export default defineConfig({
  lib: [
    {
      format: 'cjs',
      bundle: true,
      dts: false,
      source: {
        entry: { index: './src/main/index.ts' },
      },
      output: {
        distPath: { root: './lib/main' },
        target: 'node',
        filename: {
          js: '[name].cjs',
        },
        // === PRODUCTION OPTIMIZATIONS ===
        minify: !isDev,
        sourceMap: false,
      },
      tools: {
        bundlerChain(chain) {
          chain.target('electron-main');
        },
        rspack(config) {
          // === OPTIMIZATION FLAGS ===
          config.optimization = {
            minimize: !isDev,
            usedExports: !isDev,
            sideEffects: !isDev,
            concatenateModules: !isDev,
            innerGraph: !isDev,
            minimizer: isDev
              ? []
              : [
                  new rspack.SwcJsMinimizerRspackPlugin({
                    minimizerOptions: {
                      compress: {
                        drop_console: true,
                      },
                    },
                  }),
                ],
          };

          // Externalize electron core and runtime dependencies (loaded from node_modules at runtime)
          const existing = config.externals ?? [];
          const arr = Array.isArray(existing) ? existing : [existing];
          arr.push(function(ctx, callback) {
            const req = ctx.request ?? '';
            if (
              req === 'electron' ||
              req.startsWith('electron/') ||
              req === 'electron-log' ||
              req.startsWith('electron-log/') ||
              req === 'electron-updater' ||
              req.startsWith('electron-updater/')
            ) {
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
    tsconfigPath: './src/main/tsconfig.json',
  },
});
