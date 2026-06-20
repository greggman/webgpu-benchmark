// Benchmark: many `draw()` calls. One pipeline, one bind group; each frame issues
// `count` draw() calls of a 3-vertex micro-triangle. firstInstance carries the
// draw index so each triangle lands in a different grid cell (visual variety,
// no extra GPU cost). Measures the per-draw encode cost of the WebGPU impl.

import type { Benchmark, BenchContext } from '../types.js';
import { createMicroPipeline, nowSeconds, type MicroPipeline } from './shared.js';

export const drawBench: Benchmark = createDrawBench();

function createDrawBench(): Benchmark {
  let ctx: BenchContext;
  let mp: MicroPipeline;

  return {
    id: 'draw',
    name: 'draw() x N',
    description: 'Many draw() calls of a tiny triangle in one render pass.',
    unit: 'draws',

    async init(c) {
      ctx = c;
      mp = createMicroPipeline(c);
    },

    runFrame(count) {
      mp.setUniform(nowSeconds());
      const encoder = ctx.device.createCommandEncoder();
      const pass = encoder.beginRenderPass({ colorAttachments: [mp.colorAttachment()] });
      pass.setPipeline(mp.pipeline);
      pass.setBindGroup(0, mp.bindGroup);
      for (let i = 0; i < count; i++) {
        pass.draw(3, 1, 0, i); // firstInstance = i
      }
      pass.end();
      ctx.device.queue.submit([encoder.finish()]);
    },

    dispose() {
      mp.dispose();
    },
  };
}
