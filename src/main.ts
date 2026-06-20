// App entry: initialize WebGPU, mount the benchmark UI, and expose a quick-run
// hook used by the automated Puppeteer tests.
import {initGpu, GpuUnsupportedError} from './gpu/device.js';
import type {BenchContext, RunRecord} from './bench/types.js';
import {benchmarks} from './bench/registry.js';
import {runBenchmarks, QUICK_PROFILE, FULL_PROFILE} from './bench/runner.js';
import {makeRunRecord} from './ui/record.js';
import {createApp} from './ui/app.js';

declare global {
  interface Window {
    __ready?: boolean;
    __benchIds?: () => string[];
    __runQuick?: (ids?: string[]) => Promise<RunRecord>;
    // Full-profile run used by `npm run baseline` to capture reference numbers.
    __runFull?: (ids?: string[]) => Promise<RunRecord>;
  }
}

async function main() {
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const unsupported = document.getElementById('unsupported')!;
  const reason = document.getElementById('unsupported-reason')!;
  const panel = document.getElementById('panel')!;

  let gpu;
  try {
    gpu = await initGpu(canvas);
  } catch (err) {
    unsupported.hidden = false;
    reason.textContent =
      err instanceof GpuUnsupportedError ? `(${err.message})` : String(err);
    return;
  }

  const ctx: BenchContext = {
    device: gpu.device,
    canvas: gpu.canvas,
    context: gpu.context,
    format: gpu.format,
  };
  const adapter = {
    vendor: gpu.adapterInfo.vendor,
    architecture: gpu.adapterInfo.architecture,
    device: gpu.adapterInfo.device,
    description: gpu.adapterInfo.description,
  };

  createApp(panel, {ctx, adapter});

  // --- Test hooks (used by the Puppeteer smoke test) ---
  window.__benchIds = () => benchmarks.map(b => b.id);
  window.__runQuick = async (ids?: string[]): Promise<RunRecord> => {
    const selected = ids
      ? benchmarks.filter(b => ids.includes(b.id))
      : benchmarks;
    const results = await runBenchmarks(selected, ctx, QUICK_PROFILE);
    return makeRunRecord(results, 'quick', adapter);
  };
  window.__runFull = async (ids?: string[]): Promise<RunRecord> => {
    const selected = ids
      ? benchmarks.filter(b => ids.includes(b.id))
      : benchmarks;
    const results = await runBenchmarks(selected, ctx, FULL_PROFILE);
    return makeRunRecord(results, 'baseline', adapter);
  };
  window.__ready = true;
}

void main();
