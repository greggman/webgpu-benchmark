// Benchmark: many `drawIndirect()` calls. A single indirect buffer holds many
// 4-uint draw-argument records (vertexCount, instanceCount, firstVertex,
// firstInstance); each frame issues `count` drawIndirect() calls reading
// successive records. firstInstance per record drives grid placement.
import type {Benchmark, BenchContext} from '../types.js';
import {createMicroPipeline, nowSeconds, type MicroPipeline} from './shared.js';

const ENTRIES = 1 << 16; // reused via modulo when count exceeds this
const STRIDE = 16; // bytes per drawIndirect record

export const drawIndirectBench: Benchmark = createBench();

function createBench(): Benchmark {
  let ctx: BenchContext;
  let mp: MicroPipeline;
  let indirect: GPUBuffer;

  return {
    id: 'drawIndirect',
    name: 'drawIndirect() x N',
    description: 'Many drawIndirect() calls reading from one indirect buffer.',
    unit: 'draws',

    async init(c) {
      ctx = c;
      mp = createMicroPipeline(c);
      indirect = c.device.createBuffer({
        size: ENTRIES * STRIDE,
        usage: GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST,
      });
      const args = new Uint32Array(ENTRIES * 4);
      for (let i = 0; i < ENTRIES; i++) {
        args[i * 4 + 0] = 3; // vertexCount
        args[i * 4 + 1] = 1; // instanceCount
        args[i * 4 + 2] = 0; // firstVertex
        args[i * 4 + 3] = i; // firstInstance -> grid cell
      }
      c.device.queue.writeBuffer(indirect, 0, args);
    },

    runFrame(count) {
      mp.setUniform(nowSeconds());
      const encoder = ctx.device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [mp.colorAttachment()],
      });
      pass.setPipeline(mp.pipeline);
      pass.setBindGroup(0, mp.bindGroup);
      for (let i = 0; i < count; i++) {
        pass.drawIndirect(indirect, (i % ENTRIES) * STRIDE);
      }
      pass.end();
      ctx.device.queue.submit([encoder.finish()]);
    },

    dispose() {
      mp.dispose();
      indirect.destroy();
    },
  };
}
