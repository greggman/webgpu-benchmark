// Puppeteer smoke test: build, serve, and run every benchmark a few frames each
// (QUICK profile via window.__runQuick). Asserts each produces a finite positive
// score and that the page raised no errors. Fast by design.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { runBuild } from '../scripts/build.mjs';
import { serve } from '../scripts/serve.mjs';

let server;
let url;
let browser;
let page;
const pageErrors = [];

before(async () => {
  await runBuild();
  ({ server, url } = await serve());
  browser = await puppeteer.launch({ headless: true });
  page = await browser.newPage();
  page.on('pageerror', (e) => pageErrors.push(e.message));
  // Surface console errors, but ignore the harmless favicon 404.
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('favicon')) pageErrors.push(`console: ${m.text()}`);
  });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction('typeof window.__runQuick === "function"', { timeout: 20000 });
});

after(async () => {
  await browser?.close();
  server?.close();
});

test('WebGPU is supported in the test browser', async () => {
  const unsupported = await page.$eval('#unsupported', (el) => !el.hidden);
  assert.equal(unsupported, false, 'WebGPU should be available (no flags needed)');
});

test('every benchmark runs and produces a finite positive score', async () => {
  const ids = await page.evaluate('window.__benchIds()');
  assert.ok(ids.length >= 10, `expected ~10+ benchmarks, got ${ids.length}`);

  for (const id of ids) {
    const record = await page.evaluate(`window.__runQuick(${JSON.stringify([id])})`);
    const r = record.results[0];
    assert.ok(r, `${id}: produced a result`);
    assert.ok(Number.isFinite(r.score) && r.score > 0, `${id}: score finite & positive (got ${r.score})`);
    assert.ok(Number.isFinite(r.unitsPerSecond) && r.unitsPerSecond > 0, `${id}: throughput positive`);
    assert.ok(r.count >= 1, `${id}: calibrated a count`);
  }
});

test('an overall score is computed across all benchmarks', async () => {
  const record = await page.evaluate('window.__runQuick()');
  assert.ok(Number.isFinite(record.overall) && record.overall > 0, 'overall finite & positive');
  assert.equal(record.results.length, (await page.evaluate('window.__benchIds()')).length);
});

test('no page errors were raised during the run', () => {
  assert.deepEqual(pageErrors, [], `page errors:\n${pageErrors.join('\n')}`);
});
