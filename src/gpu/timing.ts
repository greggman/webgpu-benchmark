// Small statistics helpers shared by the runner.

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Geometric mean of positive numbers; used for the overall score.
export function geomean(values: number[]): number {
  const positive = values.filter(v => v > 0);
  if (positive.length === 0) return 0;
  const sumLn = positive.reduce((acc, v) => acc + Math.log(v), 0);
  return Math.exp(sumLn / positive.length);
}

// Coefficient of variation (sample stddev / mean) -- a unit-free measure of
// run-to-run spread, reported as the noise of a benchmark's per-window rates.
export function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 0;
  const variance =
    values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance) / mean;
}
