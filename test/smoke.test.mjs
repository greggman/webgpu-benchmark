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
    assert.ok(r.frames >= 1, `${id}: ran at least one frame`);
    assert.ok(
      Number.isFinite(r.cpuBusyFraction) &&
        r.cpuBusyFraction >= 0 &&
        r.cpuBusyFraction <= 1,
      `${id}: cpuBusyFraction in [0,1] (got ${r.cpuBusyFraction})`,
    );
    assert.equal(typeof r.gpuBound, 'boolean', `${id}: gpuBound is a boolean`);
  }
});

test('an overall score is computed across all benchmarks', async () => {
  const record = await page.evaluate('window.__runQuick()');
  assert.ok(Number.isFinite(record.overall) && record.overall > 0, 'overall finite & positive');
  assert.equal(record.results.length, (await page.evaluate('window.__benchIds()')).length);
});

test('a saved run can be relabelled from history after the fact', async () => {
  // Seed an unlabelled run, reload so the history panel renders it.
  await page.evaluate(() => {
    const record = {
      meta: {
        label: '',
        timestamp: '2026-01-02T03:04:05.000Z',
        userAgent: 'test',
        adapter: {vendor: '', architecture: '', device: '', description: ''},
      },
      results: [],
      overall: 1234,
    };
    const key = `${record.meta.timestamp} unlabeled`;
    localStorage.setItem('webgpu-benchmark:runs', JSON.stringify([{key, record}]));
  });
  await page.reload({waitUntil: 'load'});
  await page.waitForFunction('window.__ready === true', {timeout: 20000});

  // Click the row's ✎ (rename) button.
  const editBtn = await page.evaluateHandle(() =>
    [...document.querySelectorAll('button')].find(b => b.textContent === '✎'),
  );
  await editBtn.asElement().click();

  // Type a label and save with Enter.
  await page.type('input[placeholder="Label this run"]', 'renamed-after-run');
  await page.keyboard.press('Enter');

  const stored = await page.evaluate(() => {
    const runs = JSON.parse(localStorage.getItem('webgpu-benchmark:runs'));
    return runs[0].record.meta.label;
  });
  assert.equal(stored, 'renamed-after-run');

  // The history button should reflect the new label too.
  const buttonText = await page.$$eval('.bench-list button', els =>
    els.map(e => e.textContent).join('|'),
  );
  assert.ok(
    buttonText.includes('renamed-after-run'),
    `history shows new label (got: ${buttonText})`,
  );
});

test('dropping a JSON run imports it into history and dedupes', async () => {
  const ts = '2025-05-05T05:05:05.000Z';
  const before = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('webgpu-benchmark:runs') || '[]').length,
  );

  const dropOnce = () =>
    page.evaluate(timestamp => {
      const record = {
        meta: {
          label: 'dropped',
          timestamp,
          userAgent: 't',
          adapter: {vendor: '', architecture: '', device: '', description: ''},
        },
        results: [],
        overall: 777,
      };
      const dt = new DataTransfer();
      dt.items.add(
        new File([JSON.stringify(record)], 'run.json', {
          type: 'application/json',
        }),
      );
      const zone = document.querySelector('.dropzone');
      zone.dispatchEvent(
        new DragEvent('drop', {dataTransfer: dt, bubbles: true, cancelable: true}),
      );
    }, ts);

  await dropOnce();
  await page.waitForFunction(
    t =>
      JSON.parse(localStorage.getItem('webgpu-benchmark:runs') || '[]').some(
        r => r.record.meta.timestamp === t,
      ),
    {timeout: 5000},
    ts,
  );

  // A second drop of the same run must not create a duplicate.
  await dropOnce();
  await page.evaluate(() => new Promise(r => setTimeout(r, 200)));

  const matches = await page.evaluate(
    t =>
      JSON.parse(localStorage.getItem('webgpu-benchmark:runs') || '[]').filter(
        r => r.record.meta.timestamp === t,
      ).length,
    ts,
  );
  assert.equal(matches, 1, 'imported once, deduped on second drop');

  const after = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('webgpu-benchmark:runs') || '[]').length,
  );
  assert.equal(after, before + 1, 'exactly one new run added');
});

test('runs can be added to the comparison from history', async () => {
  await page.evaluate(() => {
    const mk = (label, ts, overall) => ({
      key: `${ts} ${label}`,
      record: {
        meta: {
          label,
          timestamp: ts,
          userAgent: 't',
          adapter: {vendor: '', architecture: '', device: '', description: ''},
        },
        results: [],
        overall,
      },
    });
    localStorage.setItem(
      'webgpu-benchmark:runs',
      JSON.stringify([
        mk('Aaa', '2024-01-01T00:00:00.000Z', 100),
        mk('Bbb', '2024-02-02T00:00:00.000Z', 200),
      ]),
    );
  });
  await page.reload({waitUntil: 'load'});
  await page.waitForFunction('window.__ready === true', {timeout: 20000});

  // Click the ⇄ (add to comparison) button on every history row.
  await page.evaluate(() => {
    [...document.querySelectorAll('.bench-list button')]
      .filter(b => b.textContent === '⇄')
      .forEach(b => b.click());
  });

  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('button')].some(
        b => b.textContent === 'Clear comparison',
      ),
    {timeout: 5000},
  );

  const headers = await page.$$eval('table th', els =>
    els.map(e => e.textContent),
  );
  assert.ok(
    headers.some(h => h.includes('Aaa')) && headers.some(h => h.includes('Bbb')),
    `comparison shows both runs (headers: ${headers.join(', ')})`,
  );
});

test('a run can be downloaded from history', async () => {
  await page.evaluate(() => {
    const ts = '2023-03-03T03:03:03.000Z';
    const record = {
      meta: {
        label: 'dl-me',
        timestamp: ts,
        userAgent: 't',
        adapter: {vendor: '', architecture: '', device: '', description: ''},
      },
      results: [],
      overall: 42,
    };
    localStorage.setItem(
      'webgpu-benchmark:runs',
      JSON.stringify([{key: `${ts} dl-me`, record}]),
    );
  });
  await page.reload({waitUntil: 'load'});
  await page.waitForFunction('window.__ready === true', {timeout: 20000});

  // Capture the download by intercepting the anchor click.
  const filename = await page.evaluate(
    () =>
      new Promise(resolve => {
        HTMLAnchorElement.prototype.click = function () {
          resolve(this.download);
        };
        const dl = [...document.querySelectorAll('.bench-list button')].find(
          b => b.textContent === '⬇',
        );
        dl.click();
      }),
  );
  assert.ok(
    filename && filename.includes('dl-me') && filename.endsWith('.json'),
    `downloaded a labelled JSON file (got: ${filename})`,
  );
});

test('no page errors were raised during the run', () => {
  assert.deepEqual(pageErrors, [], `page errors:\n${pageErrors.join('\n')}`);
});
