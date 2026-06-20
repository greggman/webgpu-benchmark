// Benchmark: many `drawIndexedIndirect()` calls. Indirect buffer holds many
// 5-uint records (indexCount, instanceCount, firstIndex, baseVertex,
// firstInstance). Each frame issues `count` drawIndexedIndirect() calls.
import type { Benchmark, BenchContext } from '../types.js';
import { createMicroPipeline, nowSeconds, type MicroPipeline } from './shared.js';

const ENTRIES = 1 << 16;
const STRIDE = 20; // bytes per drawIndexedIndirect record

export const drawIndexedIndirectBench: Benchmark = createBench();

function createBench(): Benchmark {
  let ctx: BenchContext;
  let mp: MicroPipeline;
  let indexBuffer: GPUBuffer;
  let indirect: GPUBuffer;

  return {
    id: 'drawIndexedIndirect',
    name: 'drawIndexedIndirect() x N',
    description: 'Many drawIndexedIndirect() calls reading from one indirect buffer.',
    unit: 'draws',

    async init(c) {
      ctx = c;
      mp = createMicroPipeline(c);
      indexBuffer = c.device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      });
      c.device.queue.writeBuffer(indexBuffer, 0, new Uint16Array([0, 1, 2, 0]));

      indirect = c.device.createBuffer({
        size: ENTRIES * STRIDE,
        usage: GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST,
      });
      const args = new Uint32Array(ENTRIES * 5);
      for (let i = 0; i < ENTRIES; i++) {
        args[i * 5 + 0] = 3; // indexCount
        args[i * 5 + 1] = 1; // instanceCount
        args[i * 5 + 2] = 0; // firstIndex
        args[i * 5 + 3] = 0; // baseVertex
        args[i * 5 + 4] = i; // firstInstance
      }
      c.device.queue.writeBuffer(indirect, 0, args);
    },

    runFrame(count) {
      mp.setUniform(nowSeconds());
      const encoder = ctx.device.createCommandEncoder();
      const pass = encoder.beginRenderPass({ colorAttachments: [mp.colorAttachment()] });
      pass.setPipeline(mp.pipeline);
      pass.setBindGroup(0, mp.bindGroup);
      pass.setIndexBuffer(indexBuffer, 'uint16');
      for (let i = 0; i < count; i++) {
        pass.drawIndexedIndirect(indirect, (i % ENTRIES) * STRIDE);
      }
      pass.end();
      ctx.device.queue.submit([encoder.finish()]);
    },

    dispose() {
      mp.dispose();
      indexBuffer.destroy();
      indirect.destroy();
    },
  };
}
