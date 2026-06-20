// Assembles a RunRecord (results + metadata + overall) from raw results.
import type { BenchResult, RunRecord } from '../bench/types.js';
import { overallScore } from './score.js';

export interface AdapterInfoLike {
  vendor: string;
  architecture: string;
  device: string;
  description: string;
}

export function makeRunRecord(
  results: BenchResult[],
  label: string,
  adapter: AdapterInfoLike,
  timestamp = new Date().toISOString(),
): RunRecord {
  return {
    meta: {
      label,
      timestamp,
      userAgent: navigator.userAgent,
      adapter: {
        vendor: adapter.vendor,
        architecture: adapter.architecture,
        device: adapter.device,
        description: adapter.description,
      },
    },
    results,
    overall: overallScore(results),
  };
}
