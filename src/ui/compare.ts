// Drag-and-drop comparison of two or more runs. Drop JSON files exported by the
// app (or pick from history) to see per-benchmark scores side by side with the
// delta vs the first run.
import type { RunRecord, BenchResult } from '../bench/types.js';

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
  clear(): void;
}

export function mountCompare(container: HTMLElement): CompareApi {
  container.replaceChildren();
  const h = document.createElement('h2');
  h.textContent = 'Compare runs';
  const zone = document.createElement('div');
  zone.className = 'dropzone';
  zone.textContent = 'Drag & drop two or more exported JSON runs here to compare.';
  const tableWrap = document.createElement('div');
  container.append(h, zone, tableWrap);

  const records: RunRecord[] = [];

  const render = () => {
    if (records.length === 0) {
      tableWrap.replaceChildren();
      return;
    }
    renderCompareTable(tableWrap, records, () => {
      records.length = 0;
      render();
    });
  };

  const add = (rec: RunRecord) => {
    records.push(rec);
    render();
  };

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', async (e) => {
    e.preventDefault();
    zone.classList.remove('over');
    const files = Array.from(e.dataTransfer?.files ?? []);
    for (const file of files) {
      try {
        const parsed = JSON.parse(await file.text());
        if (isRunRecord(parsed)) add(parsed);
        else console.warn(`${file.name} is not a benchmark run`);
      } catch (err) {
        console.warn(`Could not read ${file.name}:`, err);
      }
    }
  });

  return { add, clear: () => { records.length = 0; render(); } };
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
  onClear: () => void,
): void {
  wrap.replaceChildren();

  const clearBtn = document.createElement('button');
  clearBtn.className = 'secondary';
  clearBtn.textContent = 'Clear comparison';
  clearBtn.addEventListener('click', onClear);
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
    new Map(rec.results.map((r) => [r.id, r]));
  const maps = records.map(byId);

  const table = document.createElement('table');
  const head = records
    .map((rec, i) => `<th class="num">${rec.meta.label || `run ${i + 1}`}${i > 0 ? ' (Δ)' : ''}</th>`)
    .join('');
  table.innerHTML = `<thead><tr><th>Benchmark</th>${head}</tr></thead>`;

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
