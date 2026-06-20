// The benchmark runner: for each benchmark, init -> warmup -> calibrate -> measure.
//
// The whole point is to keep the GPU under-utilized so the measured time reflects
// the WebGPU implementation (CPU-side encode + submit), not the GPU. Calibration
// picks a per-frame `count` that targets a modest CPU encode time; measurement then
// records how many units/second that sustains.

import type {Benchmark, BenchContext, BenchResult} from './types.js';
import {median} from '../gpu/timing.js';
import {scoreFor} from '../ui/score.js';

export interface RunnerProfile {
  warmupFrames: number;
  calibrateTargetMs: number; // CPU time we aim each frame to take
  measureFrames: number;
  minCount: number;
  maxCount: number;
}

export const FULL_PROFILE: RunnerProfile = {
  warmupFrames: 10,
  calibrateTargetMs: 12,
  measureFrames: 90,
  minCount: 16,
  maxCount: 1 << 18,
};

// A fast profile for automated tests: a few frames per benchmark.
export const QUICK_PROFILE: RunnerProfile = {
  warmupFrames: 3,
  calibrateTargetMs: 6,
  measureFrames: 8,
  minCount: 8,
  maxCount: 1 << 13,
};

export interface ProgressEvent {
  benchId: string;
  benchName: string;
  index: number;
  total: number;
  phase: 'init' | 'warmup' | 'calibrate' | 'measure' | 'done';
}

export type ProgressFn = (e: ProgressEvent) => void;

const nextFrame = (): Promise<number> =>
  typeof requestAnimationFrame === 'function'
    ? new Promise(r => requestAnimationFrame(t => r(t)))
    : new Promise(r => setTimeout(() => r(performance.now()), 0));

// Run one frame and wait for the GPU to finish it, returning the full wall time
// (encode + submit + GPU completion). Used during calibration so that benchmarks
// whose CPU cost is tiny but whose GPU/driver cost is not (queue uploads, image
// copies) cannot run the count away and flood the queue.
async function timedFlushedFrame(
  bench: Benchmark,
  count: number,
  device: GPUDevice,
): Promise<number> {
  const t0 = performance.now();
  await bench.runFrame(count);
  await device.queue.onSubmittedWorkDone();
  return performance.now() - t0;
}

// Find a per-frame count whose flushed frame time is near the target. Growing on
// flushed time keeps the GPU from being the bottleneck and bounds the queue.
async function calibrate(
  bench: Benchmark,
  profile: RunnerProfile,
  device: GPUDevice,
): Promise<number> {
  let count = profile.minCount;
  let ms = await timedFlushedFrame(bench, count, device);
  while (ms < profile.calibrateTargetMs && count < profile.maxCount) {
    count = Math.min(count * 2, profile.maxCount);
    const a = await timedFlushedFrame(bench, count, device);
    const b = await timedFlushedFrame(bench, count, device);
    ms = Math.min(a, b);
    await nextFrame();
  }
  // Scale to land near the target without overshooting.
  if (ms > 0) {
    const scaled = Math.round((count * profile.calibrateTargetMs) / ms);
    count = Math.max(profile.minCount, Math.min(profile.maxCount, scaled));
  }
  return count;
}

async function runOne(
  bench: Benchmark,
  ctx: BenchContext,
  profile: RunnerProfile,
  index: number,
  total: number,
  onProgress?: ProgressFn,
): Promise<BenchResult> {
  const report = (phase: ProgressEvent['phase']) =>
    onProgress?.({
      benchId: bench.id,
      benchName: bench.name,
      index,
      total,
      phase,
    });

  report('init');
  ctx.device.pushErrorScope('validation');
  await bench.init(ctx);

  report('warmup');
  for (let i = 0; i < profile.warmupFrames; i++) {
    await bench.runFrame(profile.minCount);
    await nextFrame();
  }
  await ctx.device.queue.onSubmittedWorkDone();

  report('calibrate');
  const count = await calibrate(bench, profile, ctx.device);
  await ctx.device.queue.onSubmittedWorkDone();

  report('measure');
  const cpuSamples: number[] = []; // encode + submit only (the WebGPU-impl cost)
  const totalSamples: number[] = []; // encode + submit + GPU completion
  let frames = 0;
  for (let i = 0; i < profile.measureFrames; i++) {
    const t0 = performance.now();
    await bench.runFrame(count);
    const tEncode = performance.now();
    // Drain the queue so GPU work cannot back up across frames, and so the GPU's
    // own completion time becomes observable.
    await ctx.device.queue.onSubmittedWorkDone();
    const tDone = performance.now();
    cpuSamples.push(tEncode - t0);
    totalSamples.push(tDone - t0);
    frames++;
    await nextFrame();
  }

  const cpuMsMedian = median(cpuSamples);
  const totalMsMedian = median(totalSamples);
  // GPU completion time beyond CPU encode time, clamped at zero.
  const gpuMsMedian = Math.max(0, totalMsMedian - cpuMsMedian);
  // Use the sum of measured CPU encode time (excludes the rAF idle wait between
  // frames) as the basis for units/second, so the rate reflects WebGPU CPU cost.
  const cpuTotalMs = cpuSamples.reduce((a, b) => a + b, 0);
  const unitsPerSecond =
    cpuTotalMs > 0 ? (count * frames * 1000) / cpuTotalMs : 0;
  // Flag as GPU-bound when GPU completion dominates the frame: the result then
  // reflects the GPU more than the WebGPU call path. An absolute floor keeps
  // sub-millisecond noise from tripping the flag.
  const gpuBound = gpuMsMedian > cpuMsMedian * 2 && gpuMsMedian > 2;

  const err = await ctx.device.popErrorScope();
  if (err) console.warn(`[${bench.id}] validation error:`, err.message);

  bench.dispose();
  report('done');

  return {
    id: bench.id,
    name: bench.name,
    unit: bench.unit,
    count,
    frames,
    cpuMsMedian,
    gpuMsMedian,
    unitsPerSecond,
    gpuBound,
    score: scoreFor(bench.id, unitsPerSecond),
  };
}

// Run a list of benchmarks sequentially. Each is fully isolated (init/dispose).
export async function runBenchmarks(
  benches: Benchmark[],
  ctx: BenchContext,
  profile: RunnerProfile = FULL_PROFILE,
  onProgress?: ProgressFn,
): Promise<BenchResult[]> {
  const results: BenchResult[] = [];
  for (let i = 0; i < benches.length; i++) {
    results.push(
      await runOne(benches[i], ctx, profile, i, benches.length, onProgress),
    );
  }
  return results;
}
