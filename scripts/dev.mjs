import { context } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOptions, copyStatic } from './build.mjs';
import { serve } from './serve.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(path.resolve(root, '..'), 'dist');

await mkdir(outDir, { recursive: true });

// esbuild watch + copy static on every rebuild.
const ctx = await context({
  ...buildOptions,
  minify: false,
  plugins: [
    {
      name: 'copy-static',
      setup(b) {
        b.onEnd(() => copyStatic());
      },
    },
  ],
});

await ctx.watch();
await copyStatic();

const { url } = await serve();
console.log(`Dev server (watching) at ${url}`);
