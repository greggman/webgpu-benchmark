// Drag-and-drop comparison of two or more runs. Drop JSON files exported by the
// app (or pick from history) to see per-benchmark scores side by side with the
// delta vs the first run.
import type {RunRecord, BenchResult} from '../bench/types.js';

function isRunRecord(x: unknown): x is RunRecord {
  return (
    !!x &&
    typeof x === 'object' &&
    'results' in x &&
    Array.isArray((x as RunRecord).results) &&
    'overall' in x
  );
}

export interface CompareApi {
  add(record: RunRecord): void;
  remove(record: RunRecord): void;
  // Add the run if absent, remove it if present. Returns the new membership.
  toggle(record: RunRecord): boolean;
  has(record: RunRecord): boolean;
  clear(): void;
}

export interface CompareOptions {
  // Called for each valid run dropped in, so the host can persist it.
  onImport?: (record: RunRecord) => void;
  // Called after the comparison set changes, so the host can resync UI (e.g. the
  // History panel's add/remove buttons).
  onChange?: () => void;
}

// Runs are identified by their (unique, millisecond) timestamp.
const keyOf = (r: RunRecord): string => r.meta.timestamp;

export function mountCompare(
  container: HTMLElement,
  opts: CompareOptions = {},
): CompareApi {
  container.replaceChildren();
  const h = document.createElement('h2');
  h.textContent = 'Compare runs';
  const zone = document.createElement('div');
  zone.className = 'dropzone';
  zone.textContent =
    'Drag & drop exported JSON runs here to compare them (also added to History).';
  const tableWrap = document.createElement('div');
  container.append(h, zone, tableWrap);

  const records: RunRecord[] = [];
  const indexOf = (rec: RunRecord) =>
    records.findIndex(x => keyOf(x) === keyOf(rec));

  const render = () => {
    if (records.length === 0) {
      tableWrap.replaceChildren();
      return;
    }
    renderCompareTable(tableWrap, records, {onClear: clear, onRemove: remove});
  };
  const changed = () => {
    render();
    opts.onChange?.();
  };

  const has = (rec: RunRecord) => indexOf(rec) >= 0;
  const add = (rec: RunRecord) => {
    if (indexOf(rec) < 0) {
      records.push(rec);
      changed();
    }
  };
  const remove = (rec: RunRecord) => {
    const i = indexOf(rec);
    if (i >= 0) {
      records.splice(i, 1);
      changed();
    }
  };
  const toggle = (rec: RunRecord): boolean => {
    const i = indexOf(rec);
    if (i >= 0) {
      records.splice(i, 1);
      changed();
      return false;
    }
    records.push(rec);
    changed();
    return true;
  };
  const clear = () => {
    if (records.length) {
      records.length = 0;
      changed();
    }
  };

  zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.classList.add('over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', async e => {
    e.preventDefault();
    zone.classList.remove('over');
    const files = Array.from(e.dataTransfer?.files ?? []);
    for (const file of files) {
      try {
        const parsed = JSON.parse(await file.text());
        if (isRunRecord(parsed)) {
          // Persist first so the History refresh (via onChange) shows it.
          opts.onImport?.(parsed);
          add(parsed);
        } else {
          console.warn(`${file.name} is not a benchmark run`);
        }
      } catch (err) {
        console.warn(`Could not read ${file.name}:`, err);
      }
    }
  });

  return {add, remove, toggle, has, clear};
}

interface CompareTableHandlers {
  onClear: () => void;
  onRemove: (record: RunRecord) => void;
}

function deltaCell(value: number, base: number): string {
  if (base <= 0) return '';
  const pct = ((value - base) / base) * 100;
  if (Math.abs(pct) < 0.05) return '<span>0%</span>';
  const cls = pct > 0 ? 'delta-up' : 'delta-down';
  const sign = pct > 0 ? '+' : '';
  return `<span class="${cls}">${sign}${pct.toFixed(1)}%</span>`;
}

function renderCompareTable(
  wrap: HTMLElement,
  records: RunRecord[],
  handlers: CompareTableHandlers,
): void {
  wrap.replaceChildren();

  const clearBtn = document.createElement('button');
  clearBtn.className = 'secondary';
  clearBtn.textContent = 'Clear comparison';
  clearBtn.addEventListener('click', handlers.onClear);
  wrap.append(clearBtn);

  // Union of benchmark ids, preserving first-seen order.
  const order: string[] = [];
  const names = new Map<string, string>();
  for (const rec of records) {
    for (const r of rec.results) {
      if (!names.has(r.id)) {
        names.set(r.id, r.name);
        order.push(r.id);
      }
    }
  }
  const byId = (rec: RunRecord): Map<string, BenchResult> =>
    new Map(rec.results.map(r => [r.id, r]));
  const maps = records.map(byId);

  const table = document.createElement('table');

  // Header built with DOM so each run column gets a ✕ to drop just that run.
  const thead = document.createElement('thead');
  const htr = document.createElement('tr');
  const corner = document.createElement('th');
  corner.textContent = 'Benchmark';
  htr.append(corner);
  records.forEach((rec, i) => {
    const th = document.createElement('th');
    th.className = 'num';
    const label = document.createElement('span');
    label.textContent = `${rec.meta.label || `run ${i + 1}`}${i > 0 ? ' (Δ)' : ''}`;
    const x = document.createElement('button');
    x.className = 'secondary';
    x.textContent = '✕';
    x.title = 'Remove from comparison';
    x.addEventListener('click', () => handlers.onRemove(rec));
    th.append(label, ' ', x);
    htr.append(th);
  });
  thead.append(htr);
  table.append(thead);

  const tbody = document.createElement('tbody');
  for (const id of order) {
    const baseScore = maps[0].get(id)?.score ?? 0;
    const cells = maps
      .map((m, i) => {
        const r = m.get(id);
        if (!r) return '<td class="num">—</td>';
        const score = Math.round(r.score).toLocaleString();
        const delta = i === 0 ? '' : ` ${deltaCell(r.score, baseScore)}`;
        return `<td class="num">${score}${delta}</td>`;
      })
      .join('');
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${names.get(id)}</td>${cells}`;
    tbody.append(tr);
  }

  // Overall row.
  const baseOverall = records[0].overall;
  const overallCells = records
    .map((rec, i) => {
      const v = Math.round(rec.overall).toLocaleString();
      const delta = i === 0 ? '' : ` ${deltaCell(rec.overall, baseOverall)}`;
      return `<td class="num"><strong>${v}</strong>${delta}</td>`;
    })
    .join('');
  const overallRow = document.createElement('tr');
  overallRow.innerHTML = `<td><strong>Overall</strong></td>${overallCells}`;
  tbody.append(overallRow);

  table.append(tbody);
  wrap.append(table);
}
