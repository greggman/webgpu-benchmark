import {build} from 'esbuild';
import {cp, mkdir, rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(root, '..');
const srcDir = path.join(projectRoot, 'src');
const outDir = path.join(projectRoot, 'dist');

const dev = process.argv.includes('--dev');

export const buildOptions = {
  entryPoints: [path.join(srcDir, 'main.ts')],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  outfile: path.join(outDir, 'main.js'),
  sourcemap: true,
  minify: !dev,
  logLevel: 'info',
};

// Copy the static assets (index.html, style.css) into dist/.
export async function copyStatic() {
  await cp(path.join(srcDir, 'index.html'), path.join(outDir, 'index.html'));
  await cp(path.join(srcDir, 'style.css'), path.join(outDir, 'style.css'));
}

export async function runBuild() {
  await rm(outDir, {recursive: true, force: true});
  await mkdir(outDir, {recursive: true});
  await build(buildOptions);
  await copyStatic();
}

// Run directly (not when imported by dev.mjs).
if (import.meta.url === `file://${process.argv[1]}`) {
  await runBuild();
  console.log('Build complete -> dist/');
}
