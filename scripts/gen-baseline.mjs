// Generate src/ui/baseline.json by running the full benchmark suite headless and
// capturing this machine's units/second. The result is bundled at build time and
// used as the reference for scoring (a score of ~1000 == matches this baseline).
//
//   npm run baseline
import puppeteer from 'puppeteer';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runBuild} from './build.mjs';
import {serve} from './serve.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.join(root, '..', 'src', 'ui', 'baseline.json');

await runBuild();
const {server, url} = await serve();
const browser = await puppeteer.launch({headless: true});
try {
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('[pageerror]', e.message));
  await page.goto(url, {waitUntil: 'load'});
  await page.waitForFunction('typeof window.__runFull === "function"', {
    timeout: 20000,
  });

  console.log('Running the full benchmark suite to capture a baseline…');
  const record = await page.evaluate('window.__runFull()');

  const unitsPerSecond = {};
  for (const r of record.results) {
    unitsPerSecond[r.id] = Math.round(r.unitsPerSecond);
  }
  const baseline = {
    generatedAt: record.meta.timestamp,
    userAgent: record.meta.userAgent,
    adapter: record.meta.adapter,
    unitsPerSecond,
  };

  await writeFile(outFile, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`\nWrote ${path.relative(process.cwd(), outFile)}:`);
  console.table(unitsPerSecond);
  console.log('Rebuild (npm run build) to bundle the new baseline.');
} finally {
  await browser.close();
  server.close();
}
