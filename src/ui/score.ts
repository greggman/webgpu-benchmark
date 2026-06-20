// Scoring model. Each benchmark yields units/second; we normalize against a
// reference baseline so a score of ~1000 means "matches the reference machine"
// and higher is better.
//
// The baseline lives in `baseline.json` (bundled at build time) and is
// regenerated with `npm run baseline`, which runs the full suite and captures
// this machine's units/second. Recenter it on your own hardware that way.
import baseline from './baseline.json';
import {geomean} from '../gpu/timing.js';
import type {BenchResult} from '../bench/types.js';

export const REFERENCE_UPS: Record<string, number> = baseline.unitsPerSecond;

const DEFAULT_BASELINE = 100_000;

export function scoreFor(benchId: string, unitsPerSecond: number): number {
  const baseline = REFERENCE_UPS[benchId] ?? DEFAULT_BASELINE;
  return (unitsPerSecond / baseline) * 1000;
}

// Overall score = geometric mean of per-benchmark scores (resists domination by
// any single benchmark's magnitude).
export function overallScore(results: BenchResult[]): number {
  return geomean(results.map(r => r.score));
}
