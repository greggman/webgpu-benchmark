// Benchmark: many small writeTexture() calls. Each frame uploads a tiny (4x4)
// region `count` times to varying origins in a destination texture. Measures the
// per-call overhead of the queue.writeTexture path.
import type {Benchmark, BenchContext} from '../types.js';
import {encodeAnimatedClear, nowSeconds} from './shared.js';

const TILE = 4; // 4x4 rgba8 region per write
const DST = 256; // destination texture size

export const writeTextureSmallBench: Benchmark = createBench();

function createBench(): Benchmark {
  let ctx: BenchContext;
  let dst: GPUTexture;
  const tiles = DST / TILE; // writes wrap across this grid
  const payload = new Uint8Array(TILE * TILE * 4);

  return {
    id: 'writeTextureSmall',
    name: 'writeTexture() small x N',
    description: 'Many writeTexture() calls of a tiny 4x4 region.',
    unit: 'writes',

    async init(c) {
      ctx = c;
      for (let i = 0; i < payload.length; i++) payload[i] = i & 0xff;
      dst = c.device.createTexture({
        size: [DST, DST],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
      });
    },

    runFrame(count) {
      const enc = ctx.device.createCommandEncoder();
      encodeAnimatedClear(ctx, enc, nowSeconds());
      ctx.device.queue.submit([enc.finish()]);

      for (let i = 0; i < count; i++) {
        const x = (i % tiles) * TILE;
        const y = (Math.floor(i / tiles) % tiles) * TILE;
        ctx.device.queue.writeTexture(
          {texture: dst, origin: {x, y}},
          payload,
          {bytesPerRow: TILE * 4, rowsPerImage: TILE},
          {width: TILE, height: TILE},
        );
      }
    },

    dispose() {
      dst.destroy();
    },
  };
}
