// Shared types for benchmarks and the runner.

export interface BenchContext {
  device: GPUDevice;
  canvas: HTMLCanvasElement;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  hasTimestamp: boolean;
}

// A single benchmark. `runFrame` performs exactly `count` units of the operation
// under test (draws, dispatches, writeBuffers, ...). It may return a Promise for
// benchmarks that must await GPU work within the frame (e.g. mapAsync).
export interface Benchmark {
  id: string;
  name: string;
  description: string;
  // What one unit of `count` represents, e.g. "draws" or "writeBuffers".
  unit: string;
  init(ctx: BenchContext): Promise<void>;
  runFrame(count: number): void | Promise<void>;
  dispose(): void;
}

export interface BenchResult {
  id: string;
  name: string;
  unit: string;
  count: number; // calibrated units per frame
  frames: number;
  // Median per-frame CPU time (ms) spent encoding + submitting the work.
  cpuMsMedian: number;
  // Units of work per second sustained (the raw perf number).
  unitsPerSecond: number;
  // Optional GPU time from timestamp-query (ms median), when available.
  gpuMsMedian?: number;
  // True when GPU time dominates frame time -> result may reflect the GPU, not WebGPU.
  gpuBound: boolean;
  score: number;
}

export interface RunMetadata {
  label: string;
  timestamp: string; // ISO
  userAgent: string;
  adapter: { vendor: string; architecture: string; device: string; description: string };
}

export interface RunRecord {
  meta: RunMetadata;
  results: BenchResult[];
  overall: number;
}
