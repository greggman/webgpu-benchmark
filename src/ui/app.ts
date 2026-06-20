// The benchmark app UI: benchmark selection (all on by default), a labelled Run,
// live progress, and a results table. Persistence + comparison are layered on in
// storage.ts / compare.ts and wired here.
import type {BenchContext, RunRecord} from '../bench/types.js';
import type {AdapterInfoLike} from './record.js';
import {benchmarks} from '../bench/registry.js';
import {
  runBenchmarks,
  FULL_PROFILE,
  type ProgressEvent,
} from '../bench/runner.js';
import {makeRunRecord} from './record.js';
import {renderResults} from './results.js';
import {saveRun, renderHistory} from './storage.js';
import {mountCompare} from './compare.js';

export interface AppDeps {
  ctx: BenchContext;
  adapter: AdapterInfoLike;
}

const PHASE_LABEL: Record<ProgressEvent['phase'], string> = {
  init: 'initializing',
  warmup: 'warming up',
  calibrate: 'calibrating',
  measure: 'measuring',
  done: 'done',
};

export function createApp(root: HTMLElement, deps: AppDeps): void {
  root.replaceChildren();

  // --- Selection list ---
  const list = document.createElement('ul');
  list.className = 'bench-list';
  const checkboxes = new Map<string, HTMLInputElement>();
  for (const b of benchmarks) {
    const li = document.createElement('li');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.id = `bench-${b.id}`;
    checkboxes.set(b.id, cb);
    const label = document.createElement('label');
    label.htmlFor = cb.id;
    label.innerHTML = `<strong>${b.name}</strong> <span class="desc">${b.description}</span>`;
    li.append(cb, label);
    list.append(li);
  }

  // --- Toolbar ---
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.placeholder = 'Run label (e.g. "Chrome 149 M3")';
  const runBtn = document.createElement('button');
  runBtn.textContent = 'Run selected';
  const allBtn = document.createElement('button');
  allBtn.className = 'secondary';
  allBtn.textContent = 'Select all';
  const noneBtn = document.createElement('button');
  noneBtn.className = 'secondary';
  noneBtn.textContent = 'Select none';
  const saveBtn = document.createElement('button');
  saveBtn.className = 'secondary';
  saveBtn.textContent = 'Download JSON';
  saveBtn.disabled = true;
  toolbar.append(labelInput, runBtn, allBtn, noneBtn, saveBtn);

  const status = document.createElement('p');
  status.className = 'status';
  const resultsEl = document.createElement('section');
  const historyEl = document.createElement('section');
  const compareEl = document.createElement('section');

  root.append(toolbar, list, status, resultsEl, historyEl, compareEl);

  let lastRecord: RunRecord | null = null;

  const refreshHistory = () =>
    renderHistory(historyEl, rec => {
      lastRecord = rec;
      renderResults(resultsEl, rec);
      saveBtn.disabled = false;
    });

  allBtn.addEventListener('click', () =>
    checkboxes.forEach(cb => (cb.checked = true)),
  );
  noneBtn.addEventListener('click', () =>
    checkboxes.forEach(cb => (cb.checked = false)),
  );

  const onProgress = (e: ProgressEvent) => {
    status.textContent = `(${e.index + 1}/${e.total}) ${e.benchName} — ${PHASE_LABEL[e.phase]}…`;
  };

  runBtn.addEventListener('click', async () => {
    const selected = benchmarks.filter(b => checkboxes.get(b.id)?.checked);
    if (selected.length === 0) {
      status.textContent = 'Select at least one benchmark.';
      return;
    }
    runBtn.disabled = saveBtn.disabled = true;
    resultsEl.replaceChildren();
    try {
      const results = await runBenchmarks(
        selected,
        deps.ctx,
        FULL_PROFILE,
        onProgress,
      );
      lastRecord = makeRunRecord(
        results,
        labelInput.value.trim(),
        deps.adapter,
      );
      renderResults(resultsEl, lastRecord);
      saveRun(lastRecord);
      refreshHistory();
      status.textContent = `Done. Overall: ${Math.round(lastRecord.overall)}`;
    } catch (err) {
      status.textContent = `Run failed: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      runBtn.disabled = false;
      saveBtn.disabled = lastRecord === null;
    }
  });

  saveBtn.addEventListener('click', () => {
    if (!lastRecord) return;
    downloadJson(lastRecord);
  });

  mountCompare(compareEl);
  refreshHistory();
}

function downloadJson(record: RunRecord): void {
  const safeLabel = (record.meta.label || 'run').replace(/[^\w.-]+/g, '_');
  const stamp = record.meta.timestamp.replace(/[:.]/g, '-');
  const blob = new Blob([JSON.stringify(record, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `webgpu-benchmark-${safeLabel}-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
