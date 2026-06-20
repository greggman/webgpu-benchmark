// Benchmark: replay a medium render bundle many times. One bundle records a few
// hundred micro-triangle draws; each frame calls executeBundles([bundle]) `count`
// times. Measures the cost of the WebGPU bundle-replay path.
import type {Benchmark, BenchContext} from '../types.js';
import {createMicroPipeline, nowSeconds, type MicroPipeline} from './shared.js';

const BUNDLE_DRAWS = 256; // "medium sized" bundle

export const renderBundleBench: Benchmark = createBench();

function createBench(): Benchmark {
  let ctx: BenchContext;
  let mp: MicroPipeline;
  let bundle: GPURenderBundle;

  return {
    id: 'renderBundle',
    name: 'executeBundles() x N',
    description: `Replay a ${BUNDLE_DRAWS}-draw render bundle many times per frame.`,
    unit: 'bundle executes',

    async init(c) {
      ctx = c;
      mp = createMicroPipeline(c);
      const enc = c.device.createRenderBundleEncoder({
        colorFormats: [c.format],
      });
      enc.setPipeline(mp.pipeline);
      enc.setBindGroup(0, mp.bindGroup);
      for (let i = 0; i < BUNDLE_DRAWS; i++) {
        enc.draw(3, 1, 0, i);
      }
      bundle = enc.finish();
    },

    runFrame(count) {
      mp.setUniform(nowSeconds());
      const encoder = ctx.device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [mp.colorAttachment()],
      });
      for (let i = 0; i < count; i++) {
        pass.executeBundles([bundle]);
      }
      pass.end();
      ctx.device.queue.submit([encoder.finish()]);
    },

    dispose() {
      mp.dispose();
    },
  };
}
