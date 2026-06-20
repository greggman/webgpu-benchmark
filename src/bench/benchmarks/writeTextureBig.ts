// Benchmark: many big writeTexture() calls. Each frame uploads a full 256x256
// rgba8 image (256 KB) `count` times. Measures the bulk texture-upload
// throughput of the queue.writeTexture path.
import type {Benchmark, BenchContext} from '../types.js';
import {encodeAnimatedClear, nowSeconds} from './shared.js';

const SIZE = 256; // 256x256 rgba8 = 256 KB per write

export const writeTextureBigBench: Benchmark = createBench();

function createBench(): Benchmark {
  let ctx: BenchContext;
  let dst: GPUTexture;
  const payload = new Uint8Array(SIZE * SIZE * 4);

  return {
    id: 'writeTextureBig',
    name: 'writeTexture() big x N',
    description: 'Many writeTexture() calls of a full 256x256 image.',
    unit: 'writes',

    async init(c) {
      ctx = c;
      for (let i = 0; i < payload.length; i += 1019) payload[i] = i & 0xff;
      dst = c.device.createTexture({
        size: [SIZE, SIZE],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
      });
    },

    runFrame(count) {
      const enc = ctx.device.createCommandEncoder();
      encodeAnimatedClear(ctx, enc, nowSeconds());
      ctx.device.queue.submit([enc.finish()]);

      for (let i = 0; i < count; i++) {
        ctx.device.queue.writeTexture(
          {texture: dst},
          payload,
          {bytesPerRow: SIZE * 4, rowsPerImage: SIZE},
          {width: SIZE, height: SIZE},
        );
      }
    },

    dispose() {
      dst.destroy();
    },
  };
}
