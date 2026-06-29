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
import {median, coefficientOfVariation} from '../gpu/timing.js';
import {scoreFor} from '../ui/score.js';

// How many frames may be in flight at once during measurement. 2-3 is what real
// engines use; it keeps the pipe full without unbounded queue growth.
const IN_FLIGHT = 3;
// Safety cap so a stalled clock can never loop forever.
const MAX_MEASURE_FRAMES = 200_000;

export interface RunnerProfile {
  warmupFrames: number;
  // Calibration grows `count` until CPU encode time reaches encodeTargetMs (this
  // scales with the work in every browser), bounded by flushedCeilingMs so that
  // GPU/driver-heavy benches (uploads, image copies) whose encode cost is ~0 do
  // not balloon. Sizing on encode time -- not flushed time -- is essential
  // because `onSubmittedWorkDone` latency varies wildly across implementations
  // (sub-ms in Chrome, ~frame-cadence in Firefox), so flushed time alone would
  // mis-size `count` to the minimum on slow-completion browsers.
  encodeTargetMs: number;
  flushedCeilingMs: number;
  // Measurement is split into several short windows; we take the median rate
  // across them (robust to GC/scheduler stalls) and discard the first as settle.
  measureWindows: number;
  measureWindowMs: number;
  minCount: number;
  maxCount: number;
}

export const FULL_PROFILE: RunnerProfile = {
  warmupFrames: 10,
  encodeTargetMs: 8,
  flushedCeilingMs: 40,
  measureWindows: 7, // median of 6 after dropping the first
  measureWindowMs: 220,
  minCount: 16,
  maxCount: 1 << 18,
};

// A fast profile for automated tests: fewer/shorter windows, small counts.
export const QUICK_PROFILE: RunnerProfile = {
  warmupFrames: 3,
  encodeTargetMs: 3,
  flushedCeilingMs: 20,
  measureWindows: 4, // median of 3 after dropping the first
  measureWindowMs: 50,
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

interface WindowResult {
  rate: number; // units/second over this window
  frames: number;
  encode: number[]; // per-frame CPU encode+submit times
}

// Measure one window: keep up to IN_FLIGHT frames in flight (real backpressure)
// for `windowMs`, then drain. No per-frame drain and no rAF cap, so we measure
// sustained throughput, not start/stop latency.
async function measureWindow(
  bench: Benchmark,
  count: number,
  device: GPUDevice,
  windowMs: number,
): Promise<WindowResult> {
  const encode: number[] = [];
  const inFlight: Array<Promise<unknown>> = [];
  let frames = 0;
  const tStart = performance.now();
  const deadline = tStart + windowMs;
  do {
    if (inFlight.length >= IN_FLIGHT) {
      await inFlight.shift();
    }
    const e0 = performance.now();
    await bench.runFrame(count);
    encode.push(performance.now() - e0);
    inFlight.push(device.queue.onSubmittedWorkDone());
    frames++;
  } while (performance.now() < deadline && frames < MAX_MEASURE_FRAMES);
  await Promise.all(inFlight);
  const wallMs = performance.now() - tStart;
  const rate = wallMs > 0 ? (count * frames * 1000) / wallMs : 0;
  return {rate, frames, encode};
}

interface FrameTiming {
  encodeMs: number; // CPU time to encode + submit
  flushedMs: number; // encode + GPU completion (onSubmittedWorkDone)
}

// Run one frame and measure both the CPU encode time and the full flushed time.
// One frame yields both: encode = t1-t0, flushed = t2-t0.
async function timeFrame(
  bench: Benchmark,
  count: number,
  device: GPUDevice,
): Promise<FrameTiming> {
  const t0 = performance.now();
  await bench.runFrame(count);
  const t1 = performance.now();
  await device.queue.onSubmittedWorkDone();
  const t2 = performance.now();
  return {encodeMs: t1 - t0, flushedMs: t2 - t0};
}

// Size `count` by CPU encode time (browser-agnostic, scales with the work),
// bounded by a flushed-time ceiling for GPU/driver-heavy benches whose encode
// cost is ~0. Grow by doubling while both are under their limits, then scale to
// whichever bound binds first.
async function calibrate(
  bench: Benchmark,
  profile: RunnerProfile,
  device: GPUDevice,
): Promise<number> {
  let count = profile.minCount;
  let t = await timeFrame(bench, count, device);
  while (
    t.encodeMs < profile.encodeTargetMs &&
    t.flushedMs < profile.flushedCeilingMs &&
    count < profile.maxCount
  ) {
    count = Math.min(count * 2, profile.maxCount);
    const a = await timeFrame(bench, count, device);
    const b = await timeFrame(bench, count, device);
    t = {
      encodeMs: Math.min(a.encodeMs, b.encodeMs),
      flushedMs: Math.min(a.flushedMs, b.flushedMs),
    };
    await nextFrame();
  }
  // Scale toward whichever limit is closest (smallest allowed multiple).
  const byEncode =
    t.encodeMs > 0 ? profile.encodeTargetMs / t.encodeMs : Infinity;
  const byFlushed =
    t.flushedMs > 0 ? profile.flushedCeilingMs / t.flushedMs : Infinity;
  const scale = Math.min(byEncode, byFlushed);
  if (Number.isFinite(scale) && scale > 0) {
    count = Math.max(
      profile.minCount,
      Math.min(profile.maxCount, Math.round(count * scale)),
    );
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
  // Measure several short windows and take the median rate. A transient stall
  // (GC, scheduler, memory-bandwidth contention) mostly slows a single window, so
  // the median across windows is far more reproducible than one long window. The
  // first window is dropped as extra settle time.
  const rates: number[] = [];
  const encodeSamples: number[] = [];
  let frames = 0;
  for (let w = 0; w < profile.measureWindows; w++) {
    const win = await measureWindow(
      bench,
      count,
      ctx.device,
      profile.measureWindowMs,
    );
    rates.push(win.rate);
    encodeSamples.push(...win.encode);
    frames += win.frames;
    await ctx.device.queue.onSubmittedWorkDone(); // isolate windows from each other
  }
  const stableRates = rates.length > 1 ? rates.slice(1) : rates;
  const unitsPerSecond = median(stableRates);
  // Run-to-run noise as the spread of the kept windows' rates.
  const noiseCoV = coefficientOfVariation(stableRates);
  const cpuMsMedian = median(encodeSamples);

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
    unitsPerSecond,
    noiseCoV,
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
