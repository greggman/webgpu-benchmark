// Benchmark: bind-group creation churn. Each frame creates `count` fresh
// createBindGroup() objects (one per draw) pointing at the same uniform, then
// draws with them. Measures the allocation + validation cost of making bind
// groups -- a common real-world hot path -- as opposed to merely rebinding.
import type {Benchmark, BenchContext} from '../types.js';
import {createMicroPipeline, nowSeconds, type MicroPipeline} from './shared.js';

export const createBindGroupBench: Benchmark = createBench();

function createBench(): Benchmark {
  let ctx: BenchContext;
  let mp: MicroPipeline;
  let layout: GPUBindGroupLayout;

  return {
    id: 'createBindGroup',
    name: 'createBindGroup() x N',
    description: 'Create a fresh bind group per draw (bind-group churn).',
    unit: 'bind groups',

    async init(c) {
      ctx = c;
      mp = createMicroPipeline(c);
      layout = mp.pipeline.getBindGroupLayout(0);
    },

    runFrame(count) {
      mp.setUniform(nowSeconds());
      const encoder = ctx.device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [mp.colorAttachment()],
      });
      pass.setPipeline(mp.pipeline);
      for (let i = 0; i < count; i++) {
        const bindGroup = ctx.device.createBindGroup({
          layout,
          entries: [{binding: 0, resource: {buffer: mp.uniform}}],
        });
        pass.setBindGroup(0, bindGroup);
        pass.draw(3, 1, 0, i);
      }
      pass.end();
      ctx.device.queue.submit([encoder.finish()]);
    },

    dispose() {
      mp.dispose();
    },
  };
}
