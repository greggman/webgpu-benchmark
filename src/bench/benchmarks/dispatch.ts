// Benchmark: many `dispatchWorkgroups()` calls. A trivial compute shader with a
// single-invocation workgroup; each frame issues `count` dispatches in one
// compute pass. Measures the WebGPU dispatch-encode path, not GPU compute.
import type {Benchmark, BenchContext} from '../types.js';
import {
  createTrivialCompute,
  encodeAnimatedClear,
  nowSeconds,
  type TrivialCompute,
} from './shared.js';

export const dispatchBench: Benchmark = createBench();

function createBench(): Benchmark {
  let ctx: BenchContext;
  let tc: TrivialCompute;

  return {
    id: 'dispatch',
    name: 'dispatchWorkgroups() x N',
    description: 'Many dispatchWorkgroups() calls of a trivial compute shader.',
    unit: 'dispatches',

    async init(c) {
      ctx = c;
      tc = createTrivialCompute(c);
    },

    runFrame(count) {
      const encoder = ctx.device.createCommandEncoder();
      encodeAnimatedClear(ctx, encoder, nowSeconds());
      const pass = encoder.beginComputePass();
      pass.setPipeline(tc.pipeline);
      pass.setBindGroup(0, tc.bindGroup);
      for (let i = 0; i < count; i++) {
        pass.dispatchWorkgroups(1, 1, 1);
      }
      pass.end();
      ctx.device.queue.submit([encoder.finish()]);
    },

    dispose() {
      tc.dispose();
    },
  };
}
