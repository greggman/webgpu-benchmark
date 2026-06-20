// Benchmark: GPU->CPU readback via mapAsync. A ring of mappable read-back buffers;
// each unit copies a 1 MB chunk from a device buffer, maps it for reading, reads
// it, and unmaps. Measures the readback path. runFrame is async (awaits mapAsync).
import type {Benchmark, BenchContext} from '../types.js';
import {encodeAnimatedClear, nowSeconds} from './shared.js';

const CHUNK = 1 << 20; // 1 MB
const RING = 3; // in-flight readback buffers

export const mapAsyncReadBench: Benchmark = createBench();

function createBench(): Benchmark {
  let ctx: BenchContext;
  let source: GPUBuffer;
  let ring: GPUBuffer[];
  let sink = 0; // touch read data so it cannot be optimized away

  return {
    id: 'mapAsyncRead',
    name: 'mapAsync read (big) x N',
    description:
      'Big GPU->CPU readbacks through copyBufferToBuffer + mapAsync.',
    unit: 'reads',

    async init(c) {
      ctx = c;
      source = c.device.createBuffer({
        size: CHUNK,
        usage:
          GPUBufferUsage.STORAGE |
          GPUBufferUsage.COPY_SRC |
          GPUBufferUsage.COPY_DST,
      });
      c.device.queue.writeBuffer(source, 0, new Uint8Array(CHUNK));
      ring = Array.from({length: RING}, () =>
        c.device.createBuffer({
          size: CHUNK,
          usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        }),
      );
    },

    async runFrame(count) {
      const enc0 = ctx.device.createCommandEncoder();
      encodeAnimatedClear(ctx, enc0, nowSeconds());
      ctx.device.queue.submit([enc0.finish()]);

      for (let i = 0; i < count; i++) {
        const buf = ring[i % RING];
        const enc = ctx.device.createCommandEncoder();
        enc.copyBufferToBuffer(source, 0, buf, 0, CHUNK);
        ctx.device.queue.submit([enc.finish()]);
        await buf.mapAsync(GPUMapMode.READ);
        const bytes = new Uint8Array(buf.getMappedRange());
        sink = (sink + bytes[0] + bytes[CHUNK - 1]) & 0xff;
        buf.unmap();
      }
    },

    dispose() {
      void sink;
      source.destroy();
      for (const b of ring) b.destroy();
    },
  };
}
