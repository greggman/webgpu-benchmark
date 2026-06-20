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
