// Benchmark: many big `writeBuffer()` calls. Each frame issues `count`
// writeBuffer() calls of a large (1 MB) payload. Measures the bulk
// staging/upload throughput of the queue.writeBuffer path.
import type { Benchmark, BenchContext } from '../types.js';
import { encodeAnimatedClear, nowSeconds } from './shared.js';

const CHUNK = 1 << 20; // 1 MB per write

export const writeBufferBigBench: Benchmark = createBench();

function createBench(): Benchmark {
  let ctx: BenchContext;
  let dst: GPUBuffer;
  const payload = new Uint8Array(CHUNK);

  return {
    id: 'writeBufferBig',
    name: 'writeBuffer() big x N',
    description: 'Many writeBuffer() calls with a large (1 MB) payload.',
    unit: 'writes',

    async init(c) {
      ctx = c;
      // Single destination; each write overwrites it (we measure upload, not
      // distinct storage). Fill source with something non-zero once.
      for (let i = 0; i < payload.length; i += 997) payload[i] = i & 0xff;
      dst = c.device.createBuffer({
        size: CHUNK,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
    },

    runFrame(count) {
      const enc = ctx.device.createCommandEncoder();
      encodeAnimatedClear(ctx, enc, nowSeconds());
      ctx.device.queue.submit([enc.finish()]);

      for (let i = 0; i < count; i++) {
        ctx.device.queue.writeBuffer(dst, 0, payload);
      }
    },

    dispose() {
      dst.destroy();
    },
  };
}
