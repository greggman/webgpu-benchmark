// Benchmark: non-dependent interleaved render + compute passes. Each unit encodes
// one small render pass (to an offscreen target) and one compute pass that touch
// independent resources, so there is no data dependency between them. Some WebGPU
// implementations parallelize independent passes; this rewards that.
import type {Benchmark, BenchContext} from '../types.js';
import {
  createMicroPipeline,
  createOffscreenTarget,
  createTrivialCompute,
  nowSeconds,
  type MicroPipeline,
  type OffscreenTarget,
  type TrivialCompute,
} from './shared.js';

const RENDER_DRAWS = 8; // tiny render pass workload per unit

export const interleavedPassesBench: Benchmark = createBench();

function createBench(): Benchmark {
  let ctx: BenchContext;
  let mp: MicroPipeline;
  let target: OffscreenTarget;
  let tc: TrivialCompute;

  return {
    id: 'interleavedPasses',
    name: 'interleaved render+compute x N',
    description:
      'Alternating non-dependent render and compute passes per frame.',
    unit: 'pass pairs',

    async init(c) {
      ctx = c;
      mp = createMicroPipeline(c);
      target = createOffscreenTarget(c);
      tc = createTrivialCompute(c);
    },

    runFrame(count) {
      mp.setUniform(nowSeconds());
      const encoder = ctx.device.createCommandEncoder();
      for (let i = 0; i < count; i++) {
        // Render pass -> offscreen target (independent of the compute output).
        const rp = encoder.beginRenderPass({
          colorAttachments: [target.colorAttachment()],
        });
        rp.setPipeline(mp.pipeline);
        rp.setBindGroup(0, mp.bindGroup);
        for (let d = 0; d < RENDER_DRAWS; d++)
          rp.draw(3, 1, 0, i * RENDER_DRAWS + d);
        rp.end();
        // Compute pass -> storage buffer (independent of the render output).
        const cp = encoder.beginComputePass();
        cp.setPipeline(tc.pipeline);
        cp.setBindGroup(0, tc.bindGroup);
        cp.dispatchWorkgroups(1, 1, 1);
        cp.end();
      }
      ctx.device.queue.submit([encoder.finish()]);
    },

    dispose() {
      mp.dispose();
      target.dispose();
      tc.dispose();
    },
  };
}
