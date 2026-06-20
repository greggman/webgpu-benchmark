// The benchmark runner: for each benchmark, init -> warmup -> calibrate -> measure.
//
// Throughput is measured by keeping the GPU pipe full -- the standard "frames in
// flight" pattern -- rather than submitting one frame and waiting for it to fully
// drain. Draining every frame would measure start+stop latency (accelerate, stop,
// repeat) instead of sustained throughput, and would hide an implementation that
// is fast under constant load but has high per-submit latency. We let up to
// IN_FLIGHT frames be in flight and only block when we get that far ahead (real
// backpressure), then report units/second over the wall-clock window.
//
// Because each benchmark keeps per-call GPU work trivial, the sustained rate
// reflects the WebGPU submission path for the call-count benchmarks, and the
// honest driver/upload throughput for the copy/write ones.

import type {Benchmark, BenchContext, BenchResult} from './types.js';
import {median} from '../gpu/timing.js';
import {scoreFor} from '../ui/score.js';

// How many frames may be in flight at once during measurement. 2-3 is what real
// engines use; it keeps the pipe full without unbounded queue growth.
const IN_FLIGHT = 3;
// Safety cap so a stalled clock can never loop forever.
const MAX_MEASURE_FRAMES = 200_000;

export interface RunnerProfile {
  warmupFrames: number;
  calibrateTargetMs: number; // flushed frame time we size `count` against
  measureMs: number; // wall-clock duration of the measurement window
  minCount: number;
  maxCount: number;
}

export const FULL_PROFILE: RunnerProfile = {
  warmupFrames: 10,
  calibrateTargetMs: 12,
  measureMs: 1500,
  minCount: 16,
  maxCount: 1 << 18,
};

// A fast profile for automated tests: short window, small counts.
export const QUICK_PROFILE: RunnerProfile = {
  warmupFrames: 3,
  calibrateTargetMs: 6,
  measureMs: 150,
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
  // Keep up to IN_FLIGHT frames in flight: encode + submit without waiting, and
  // only block when we are that many frames ahead (backpressure). No per-frame
  // drain and no rAF vsync cap, so we measure sustained throughput, not the cost
  // of starting and stopping from an idle GPU each frame.
  const encodeSamples: number[] = []; // per-frame CPU encode+submit time
  const inFlight: Array<Promise<unknown>> = [];
  let frames = 0;
  const tStart = performance.now();
  const deadline = tStart + profile.measureMs;
  do {
    if (inFlight.length >= IN_FLIGHT) {
      await inFlight.shift(); // wait for the oldest frame's GPU work to finish
    }
    const e0 = performance.now();
    await bench.runFrame(count);
    encodeSamples.push(performance.now() - e0);
    inFlight.push(ctx.device.queue.onSubmittedWorkDone());
    frames++;
  } while (performance.now() < deadline && frames < MAX_MEASURE_FRAMES);
  // Drain the last few in-flight frames so the window includes their completion.
  await Promise.all(inFlight);
  const wallMs = performance.now() - tStart;

  const cpuMsMedian = median(encodeSamples);
  // Sustained units/second over the full window with the pipe kept full.
  const unitsPerSecond = wallMs > 0 ? (count * frames * 1000) / wallMs : 0;
  // Fraction of the window the CPU spent encoding rather than blocked on the
  // pipe. If the CPU is mostly idle, the GPU/driver -- not WebGPU's call path --
  // is the bottleneck, so the result is GPU-bound.
  const encodeTotalMs = encodeSamples.reduce((a, b) => a + b, 0);
  const cpuBusyFraction = wallMs > 0 ? Math.min(1, encodeTotalMs / wallMs) : 0;
  const gpuBound = cpuBusyFraction < 0.5;

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
    cpuBusyFraction,
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
