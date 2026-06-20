// Benchmark: many `copyExternalImageToTexture()` calls. A small ImageBitmap is
// decoded once; each frame copies it into a destination texture `count` times.
// Measures the cost of the external-image import path in the WebGPU impl.
import type {Benchmark, BenchContext} from '../types.js';
import {encodeAnimatedClear, nowSeconds} from './shared.js';

const IMG_SIZE = 512; // source image size
const DST_SIZE = 1024; // destination texture size (copies tile into it)

export const copyExternalImageBench: Benchmark = createBench();

function createBench(): Benchmark {
  let ctx: BenchContext;
  let bitmap: ImageBitmap;
  let dst: GPUTexture;
  const tiles = Math.floor(DST_SIZE / IMG_SIZE); // copies wrap across this grid

  return {
    id: 'copyExternalImage',
    name: 'copyExternalImageToTexture() x N',
    description:
      'Many copyExternalImageToTexture() calls importing a small image.',
    unit: 'copies',

    async init(c) {
      ctx = c;
      // Build a small colorful source image once.
      const off = new OffscreenCanvas(IMG_SIZE, IMG_SIZE);
      const g = off.getContext('2d')!;
      const grad = g.createLinearGradient(0, 0, IMG_SIZE, IMG_SIZE);
      grad.addColorStop(0, '#58a6ff');
      grad.addColorStop(1, '#f85149');
      g.fillStyle = grad;
      g.fillRect(0, 0, IMG_SIZE, IMG_SIZE);
      bitmap = await createImageBitmap(off);

      dst = c.device.createTexture({
        size: [DST_SIZE, DST_SIZE],
        format: 'rgba8unorm',
        usage:
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.RENDER_ATTACHMENT,
      });
    },

    runFrame(count) {
      // The animated clear gives visual feedback (copies go to an offscreen tex).
      const enc = ctx.device.createCommandEncoder();
      encodeAnimatedClear(ctx, enc, nowSeconds());
      ctx.device.queue.submit([enc.finish()]);

      for (let i = 0; i < count; i++) {
        const tx = (i % tiles) * IMG_SIZE;
        const ty = (Math.floor(i / tiles) % tiles) * IMG_SIZE;
        ctx.device.queue.copyExternalImageToTexture(
          {source: bitmap},
          {texture: dst, origin: {x: tx, y: ty}},
          {width: IMG_SIZE, height: IMG_SIZE},
        );
      }
    },

    dispose() {
      bitmap.close();
      dst.destroy();
    },
  };
}
