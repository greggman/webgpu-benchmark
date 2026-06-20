// Persistence of runs in localStorage, keyed by timestamp + label, plus a small
// history UI to reload or delete saved runs.
import type {RunRecord} from '../bench/types.js';

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
  runs.unshift({key, record});
  writeRuns(runs);
  return {key, record};
}

export function deleteRun(key: string): void {
  writeRuns(listRuns().filter(r => r.key !== key));
}

// Add an externally-supplied run (e.g. a dropped JSON file) to the collection,
// deduped by timestamp. Returns true if it was newly added, false if already
// present.
export function importRun(record: RunRecord): boolean {
  const runs = listRuns();
  if (runs.some(r => r.record.meta.timestamp === record.meta.timestamp)) {
    return false;
  }
  const key = `${record.meta.timestamp} ${record.meta.label || 'unlabeled'}`;
  runs.unshift({key, record});
  writeRuns(runs);
  return true;
}

// Update a saved run's label after the fact. The stored key stays stable (it is
// just an opaque identity), so renaming never collides with delete/select.
export function renameRun(key: string, label: string): void {
  const runs = listRuns();
  const run = runs.find(r => r.key === key);
  if (!run) return;
  run.record.meta.label = label;
  writeRuns(runs);
}

export interface HistoryHandlers {
  // Reload a run into the results panel.
  onSelect: (rec: RunRecord) => void;
  // Add a run to the comparison panel.
  onCompare: (rec: RunRecord) => void;
  // Download a run as JSON.
  onDownload: (rec: RunRecord) => void;
}

// Render the saved-run history.
export function renderHistory(
  container: HTMLElement,
  handlers: HistoryHandlers,
): void {
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
  const rerender = () => renderHistory(container, handlers);
  for (const {key, record} of runs) {
    ul.append(historyRow(key, record, rerender, handlers));
  }
  container.append(ul);
}

// One history entry. Click the label to reload it; ⇄ adds it to the comparison;
// ✎ switches the row into an inline editor so a run can be (re)labelled.
function historyRow(
  key: string,
  record: RunRecord,
  rerender: () => void,
  handlers: HistoryHandlers,
): HTMLLIElement {
  const {onSelect, onCompare, onDownload} = handlers;
  const li = document.createElement('li');
  const when = new Date(record.meta.timestamp).toLocaleString();

  const open = document.createElement('button');
  open.className = 'secondary';
  open.textContent = `${when} — ${record.meta.label || 'unlabeled'} — ${Math.round(record.overall)}`;
  open.title = when;
  open.addEventListener('click', () => onSelect(record));

  const download = document.createElement('button');
  download.className = 'secondary';
  download.textContent = '⬇';
  download.title = 'Download JSON';
  download.addEventListener('click', () => onDownload(record));

  const compare = document.createElement('button');
  compare.className = 'secondary';
  compare.textContent = '⇄';
  compare.title = 'Add to comparison';
  compare.addEventListener('click', () => onCompare(record));

  const edit = document.createElement('button');
  edit.className = 'secondary';
  edit.textContent = '✎';
  edit.title = 'Rename';

  const del = document.createElement('button');
  del.className = 'secondary';
  del.textContent = '✕';
  del.title = 'Delete';
  del.addEventListener('click', () => {
    deleteRun(key);
    rerender();
  });

  // Swap the row into an inline editor: a text field plus save/cancel.
  edit.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = record.meta.label;
    input.placeholder = 'Label this run';
    input.title = when;

    const save = () => {
      record.meta.label = input.value.trim();
      renameRun(key, record.meta.label);
      onSelect(record); // refresh the results panel + download with the new label
      rerender();
    };
    const cancel = () => rerender();

    const ok = document.createElement('button');
    ok.textContent = '✓';
    ok.title = 'Save';
    ok.addEventListener('click', save);

    const no = document.createElement('button');
    no.className = 'secondary';
    no.textContent = '✕';
    no.title = 'Cancel';
    no.addEventListener('click', cancel);

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') save();
      else if (e.key === 'Escape') cancel();
    });

    li.replaceChildren(input, ok, no);
    input.focus();
    input.select();
  });

  li.append(open, download, compare, edit, del);
  return li;
}
