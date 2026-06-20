// Benchmark: many small `writeBuffer()` calls. Each frame issues `count`
// writeBuffer() calls of a tiny (16-byte) payload at varying offsets. Measures
// the per-call overhead of the queue.writeBuffer upload path.
import type {Benchmark, BenchContext} from '../types.js';
import {encodeAnimatedClear, nowSeconds} from './shared.js';

const PAYLOAD = 16; // bytes per write
const SLOTS = 1 << 14; // distinct offsets (256 KB buffer)

export const writeBufferSmallBench: Benchmark = createBench();

function createBench(): Benchmark {
  let ctx: BenchContext;
  let dst: GPUBuffer;
  const payload = new Uint8Array(PAYLOAD);

  return {
    id: 'writeBufferSmall',
    name: 'writeBuffer() small x N',
    description: 'Many writeBuffer() calls with a tiny (16-byte) payload.',
    unit: 'writes',

    async init(c) {
      ctx = c;
      dst = c.device.createBuffer({
        size: SLOTS * PAYLOAD,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
    },

    runFrame(count) {
      const enc = ctx.device.createCommandEncoder();
      encodeAnimatedClear(ctx, enc, nowSeconds());
      ctx.device.queue.submit([enc.finish()]);

      for (let i = 0; i < count; i++) {
        ctx.device.queue.writeBuffer(dst, (i % SLOTS) * PAYLOAD, payload);
      }
    },

    dispose() {
      dst.destroy();
    },
  };
}
