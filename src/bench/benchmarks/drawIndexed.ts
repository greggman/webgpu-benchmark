// Benchmark: many `drawIndexed()` calls. Same micro-triangle, driven by a 3-entry
// index buffer; firstInstance carries the draw index for grid placement.
import type { Benchmark, BenchContext } from '../types.js';
import { createMicroPipeline, nowSeconds, type MicroPipeline } from './shared.js';

export const drawIndexedBench: Benchmark = createBench();

function createBench(): Benchmark {
  let ctx: BenchContext;
  let mp: MicroPipeline;
  let indexBuffer: GPUBuffer;

  return {
    id: 'drawIndexed',
    name: 'drawIndexed() x N',
    description: 'Many drawIndexed() calls of a tiny indexed triangle.',
    unit: 'draws',

    async init(c) {
      ctx = c;
      mp = createMicroPipeline(c);
      indexBuffer = c.device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      });
      c.device.queue.writeBuffer(indexBuffer, 0, new Uint16Array([0, 1, 2, 0]));
    },

    runFrame(count) {
      mp.setUniform(nowSeconds());
      const encoder = ctx.device.createCommandEncoder();
      const pass = encoder.beginRenderPass({ colorAttachments: [mp.colorAttachment()] });
      pass.setPipeline(mp.pipeline);
      pass.setBindGroup(0, mp.bindGroup);
      pass.setIndexBuffer(indexBuffer, 'uint16');
      for (let i = 0; i < count; i++) {
        pass.drawIndexed(3, 1, 0, 0, i); // firstInstance = i
      }
      pass.end();
      ctx.device.queue.submit([encoder.finish()]);
    },

    dispose() {
      mp.dispose();
      indexBuffer.destroy();
    },
  };
}
