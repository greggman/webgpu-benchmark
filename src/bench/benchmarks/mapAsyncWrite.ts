// Benchmark: big uploads via mapAsync. A ring of mappable upload buffers; each
// unit maps a buffer, writes a 1 MB chunk, unmaps, and copies it into a device
// buffer. Measures the map-based upload path. runFrame is async (awaits mapAsync).
import type { Benchmark, BenchContext } from '../types.js';
import { encodeAnimatedClear, nowSeconds } from './shared.js';

const CHUNK = 1 << 20; // 1 MB
const RING = 3; // in-flight upload buffers

export const mapAsyncWriteBench: Benchmark = createBench();

function createBench(): Benchmark {
  let ctx: BenchContext;
  let ring: GPUBuffer[];
  let dst: GPUBuffer;
  const filler = new Uint8Array(CHUNK);

  return {
    id: 'mapAsyncWrite',
    name: 'mapAsync write (big) x N',
    description: 'Big uploads through mapAsync + copyBufferToBuffer.',
    unit: 'maps',

    async init(c) {
      ctx = c;
      for (let i = 0; i < filler.length; i += 1021) filler[i] = i & 0xff;
      ring = Array.from({ length: RING }, () =>
        c.device.createBuffer({
          size: CHUNK,
          usage: GPUBufferUsage.MAP_WRITE | GPUBufferUsage.COPY_SRC,
        }),
      );
      dst = c.device.createBuffer({
        size: CHUNK,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
    },

    async runFrame(count) {
      const enc0 = ctx.device.createCommandEncoder();
      encodeAnimatedClear(ctx, enc0, nowSeconds());
      ctx.device.queue.submit([enc0.finish()]);

      for (let i = 0; i < count; i++) {
        const buf = ring[i % RING];
        await buf.mapAsync(GPUMapMode.WRITE);
        new Uint8Array(buf.getMappedRange()).set(filler);
        buf.unmap();
        const enc = ctx.device.createCommandEncoder();
        enc.copyBufferToBuffer(buf, 0, dst, 0, CHUNK);
        ctx.device.queue.submit([enc.finish()]);
      }
    },

    dispose() {
      for (const b of ring) b.destroy();
      dst.destroy();
    },
  };
}
