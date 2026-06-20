// Benchmark: render-pass begin/end churn. Each frame opens and closes `count`
// tiny render passes (one micro-draw each) against a small offscreen target.
// Measures the per-pass setup/teardown cost, distinct from per-draw cost.
import type {Benchmark, BenchContext} from '../types.js';
import {
  createMicroPipeline,
  createOffscreenTarget,
  encodeAnimatedClear,
  nowSeconds,
  type MicroPipeline,
  type OffscreenTarget,
} from './shared.js';

export const renderPassesBench: Benchmark = createBench();

function createBench(): Benchmark {
  let ctx: BenchContext;
  let mp: MicroPipeline;
  let target: OffscreenTarget;

  return {
    id: 'renderPasses',
    name: 'render passes x N',
    description: 'Many beginRenderPass()/end() pairs per frame.',
    unit: 'passes',

    async init(c) {
      ctx = c;
      mp = createMicroPipeline(c);
      target = createOffscreenTarget(c, 64);
    },

    runFrame(count) {
      mp.setUniform(nowSeconds());
      const encoder = ctx.device.createCommandEncoder();
      encodeAnimatedClear(ctx, encoder, nowSeconds()); // keep the canvas alive
      for (let i = 0; i < count; i++) {
        const pass = encoder.beginRenderPass({
          colorAttachments: [target.colorAttachment()],
        });
        pass.setPipeline(mp.pipeline);
        pass.setBindGroup(0, mp.bindGroup);
        pass.draw(3, 1, 0, i);
        pass.end();
      }
      ctx.device.queue.submit([encoder.finish()]);
    },

    dispose() {
      mp.dispose();
      target.dispose();
    },
  };
}
