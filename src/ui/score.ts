// Scoring model. Each benchmark yields units/second; we normalize against a
// baked-in reference baseline so a score of ~1000 means "matches the reference
// machine" and higher is better. Baselines are intentionally easy to retune
// after collecting real runs.
import { geomean } from '../gpu/timing.js';
import type { BenchResult } from '../bench/types.js';

// Reference units/second captured on a development machine. These are rough
// placeholders; retune from real data. Higher hardware/impl -> score > 1000.
export const REFERENCE_UPS: Record<string, number> = {
  copyExternalImage: 200_000,
  writeBufferSmall: 1_500_000,
  writeBufferBig: 4_000,
  mapAsyncWrite: 3_000,
  draw: 1_200_000,
  drawIndexed: 1_100_000,
  drawIndirect: 900_000,
  drawIndexedIndirect: 850_000,
  renderBundle: 3_000_000,
  dispatch: 1_400_000,
  interleavedPasses: 60_000,
};

const DEFAULT_BASELINE = 100_000;

export function scoreFor(benchId: string, unitsPerSecond: number): number {
  const baseline = REFERENCE_UPS[benchId] ?? DEFAULT_BASELINE;
  return (unitsPerSecond / baseline) * 1000;
}

// Overall score = geometric mean of per-benchmark scores (resists domination by
// any single benchmark's magnitude).
export function overallScore(results: BenchResult[]): number {
  return geomean(results.map((r) => r.score));
}
