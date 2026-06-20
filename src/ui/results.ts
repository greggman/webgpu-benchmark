// Renders a run's results as a score table with an overall (geomean) score.
import type {RunRecord, BenchResult} from '../bench/types.js';

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString();
}

function row(r: BenchResult): HTMLTableRowElement {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${r.name}</td>
    <td class="num">${fmtInt(r.score)}</td>
    <td class="num">${fmtInt(r.unitsPerSecond)} ${r.unit}/s</td>
    <td class="num">${fmtInt(r.count)}</td>
    <td class="num">${r.cpuMsMedian.toFixed(2)} ms</td>
    <td class="num">${r.noiseCoV === undefined ? '—' : `±${(r.noiseCoV * 100).toFixed(1)}%`}</td>`;
  return tr;
}

export function renderResults(container: HTMLElement, record: RunRecord): void {
  container.replaceChildren();

  const overall = document.createElement('p');
  overall.className = 'overall';
  overall.textContent = `Overall score: ${fmtInt(record.overall)}`;
  container.append(overall);

  const meta = document.createElement('p');
  meta.className = 'status';
  const a = record.meta.adapter;
  const when = new Date(record.meta.timestamp).toLocaleString();
  // Date/time first, then the label (which may be empty until set in History).
  meta.textContent = `${when} · ${record.meta.label || 'unlabeled'} · ${a.vendor} ${a.architecture}`;
  container.append(meta);

  const table = document.createElement('table');
  table.innerHTML = `
    <thead><tr>
      <th>Benchmark</th>
      <th class="num">Score</th>
      <th class="num">Throughput</th>
      <th class="num">Count/frame</th>
      <th class="num">CPU/frame</th>
      <th class="num">Noise</th>
    </tr></thead>`;
  const tbody = document.createElement('tbody');
  for (const r of record.results) tbody.append(row(r));
  table.append(tbody);
  container.append(table);
}
