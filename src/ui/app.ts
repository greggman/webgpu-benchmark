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
import {saveRun, importRun, renderHistory} from './storage.js';
import {mountCompare, type CompareApi} from './compare.js';

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

// How far through a single benchmark each phase is, for the progress bar.
const PHASE_FRACTION: Record<ProgressEvent['phase'], number> = {
  init: 0,
  warmup: 0.15,
  calibrate: 0.35,
  measure: 0.6,
  done: 1,
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
  // No pre-run label field: runs are recorded with just a timestamp and can be
  // labelled afterward from the History panel (the common case is forgetting to
  // label up front).
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  const runBtn = document.createElement('button');
  runBtn.textContent = 'Run selected';
  const allBtn = document.createElement('button');
  allBtn.className = 'secondary';
  allBtn.textContent = 'Select all';
  const noneBtn = document.createElement('button');
  noneBtn.className = 'secondary';
  noneBtn.textContent = 'Select none';
  toolbar.append(runBtn, allBtn, noneBtn);

  // Download lives with the results (right after the "Done" status line and above
  // the score), since that is where the user is looking after a run.
  const saveBtn = document.createElement('button');
  saveBtn.className = 'secondary';
  saveBtn.textContent = 'Download JSON';
  saveBtn.disabled = true;

  const status = document.createElement('p');
  status.className = 'status';
  const resultsEl = document.createElement('section');
  const historyEl = document.createElement('section');
  const compareEl = document.createElement('section');

  root.append(toolbar, list, status, saveBtn, resultsEl, historyEl, compareEl);

  let lastRecord: RunRecord | null = null;

  // Hoisted so it can be referenced by the compare panel's onImport below while
  // still closing over `compare` (which is created after).
  function refreshHistory() {
    renderHistory(historyEl, {
      onSelect: rec => {
        lastRecord = rec;
        renderResults(resultsEl, rec);
        saveBtn.disabled = false;
      },
      onCompare: rec => compare.toggle(rec),
      isInComparison: rec => compare.has(rec),
      onDownload: rec => downloadJson(rec),
    });
  }

  allBtn.addEventListener('click', () =>
    checkboxes.forEach(cb => (cb.checked = true)),
  );
  noneBtn.addEventListener('click', () =>
    checkboxes.forEach(cb => (cb.checked = false)),
  );

  // The run overlay (canvas + live progress) only appears while a run is active.
  const overlay = document.getElementById('overlay')!;
  const overlayStatus = document.getElementById('overlay-status')!;
  const progressBar = document.getElementById('progress-bar')!;

  const setProgress = (fraction: number) => {
    progressBar.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
  };

  const onProgress = (e: ProgressEvent) => {
    overlayStatus.textContent = `(${e.index + 1}/${e.total}) ${e.benchName} — ${PHASE_LABEL[e.phase]}…`;
    setProgress((e.index + PHASE_FRACTION[e.phase]) / e.total);
  };

  runBtn.addEventListener('click', async () => {
    const selected = benchmarks.filter(b => checkboxes.get(b.id)?.checked);
    if (selected.length === 0) {
      status.textContent = 'Select at least one benchmark.';
      return;
    }
    runBtn.disabled = saveBtn.disabled = true;
    resultsEl.replaceChildren();
    setProgress(0);
    overlayStatus.textContent = 'Starting…';
    overlay.hidden = false;
    try {
      const results = await runBenchmarks(
        selected,
        deps.ctx,
        FULL_PROFILE,
        onProgress,
      );
      lastRecord = makeRunRecord(results, '', deps.adapter);
      renderResults(resultsEl, lastRecord);
      saveRun(lastRecord);
      refreshHistory();
      status.textContent = `Done. Overall: ${Math.round(lastRecord.overall)}`;
    } catch (err) {
      status.textContent = `Run failed: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      overlay.hidden = true;
      runBtn.disabled = false;
      saveBtn.disabled = lastRecord === null;
    }
  });

  saveBtn.addEventListener('click', () => {
    if (!lastRecord) return;
    downloadJson(lastRecord);
  });

  // Dropping a JSON run into the compare panel also files it into History
  // (deduped by timestamp) so it persists alongside local runs. onChange keeps the
  // History panel's ⇄ buttons in sync as the comparison set changes.
  const compare: CompareApi = mountCompare(compareEl, {
    onImport: record => importRun(record),
    onChange: () => refreshHistory(),
  });
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
