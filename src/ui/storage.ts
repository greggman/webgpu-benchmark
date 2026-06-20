// Persistence of runs in localStorage, keyed by timestamp + label, plus a small
// history UI to reload or delete saved runs.
import type { RunRecord } from '../bench/types.js';

const KEY = 'webgpu-benchmark:runs';
const MAX_RUNS = 50;

export interface StoredRun {
  key: string; // timestamp + label
  record: RunRecord;
}

export function listRuns(): StoredRun[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredRun[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRuns(runs: StoredRun[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(runs.slice(0, MAX_RUNS)));
  } catch (err) {
    console.warn('Could not persist runs:', err);
  }
}

export function saveRun(record: RunRecord): StoredRun {
  const key = `${record.meta.timestamp} ${record.meta.label || 'unlabeled'}`;
  const runs = listRuns();
  runs.unshift({ key, record });
  writeRuns(runs);
  return { key, record };
}

export function deleteRun(key: string): void {
  writeRuns(listRuns().filter((r) => r.key !== key));
}

// Render the saved-run history. `onSelect` is called when a run is clicked.
export function renderHistory(container: HTMLElement, onSelect: (rec: RunRecord) => void): void {
  container.replaceChildren();
  const runs = listRuns();
  const h = document.createElement('h2');
  h.textContent = `History (${runs.length})`;
  container.append(h);
  if (runs.length === 0) {
    const p = document.createElement('p');
    p.className = 'status';
    p.textContent = 'No saved runs yet. Run a benchmark to save one.';
    container.append(p);
    return;
  }
  const ul = document.createElement('ul');
  ul.className = 'bench-list';
  for (const { key, record } of runs) {
    const li = document.createElement('li');
    const open = document.createElement('button');
    open.className = 'secondary';
    open.textContent = `${record.meta.label || 'unlabeled'} — ${Math.round(record.overall)}`;
    open.title = new Date(record.meta.timestamp).toLocaleString();
    open.addEventListener('click', () => onSelect(record));
    const del = document.createElement('button');
    del.className = 'secondary';
    del.textContent = '✕';
    del.title = 'Delete';
    del.addEventListener('click', () => {
      deleteRun(key);
      renderHistory(container, onSelect);
    });
    li.append(open, del);
    ul.append(li);
  }
  container.append(ul);
}
