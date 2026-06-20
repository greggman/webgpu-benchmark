// Benchmark: setBindGroup with dynamic offsets. One bind group is created once;
// each of `count` draws rebinds it with a different dynamic offset into a large
// uniform buffer. Measures the optimized rebind path -- the cheap contrast to
// createBindGroup churn.
import type {Benchmark, BenchContext} from '../types.js';
import {MICRO_WGSL, nowSeconds} from './shared.js';

const ALIGN = 256; // a safe multiple of minUniformBufferOffsetAlignment
const SLOTS = 256; // distinct dynamic offsets (256 * 256B = 64 KB buffer)
const GRID_N = 64;

export const setBindGroupDynamicBench: Benchmark = createBench();

function createBench(): Benchmark {
  let ctx: BenchContext;
  let pipeline: GPURenderPipeline;
  let bindGroup: GPUBindGroup;
  let uniform: GPUBuffer;

  return {
    id: 'setBindGroupDynamic',
    name: 'setBindGroup() dynamic x N',
    description: 'Rebind one bind group with N different dynamic offsets.',
    unit: 'rebinds',

    async init(c) {
      ctx = c;
      const module = c.device.createShaderModule({code: MICRO_WGSL});
      const bgl = c.device.createBindGroupLayout({
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: {
              type: 'uniform',
              hasDynamicOffset: true,
              minBindingSize: 16,
            },
          },
        ],
      });
      pipeline = c.device.createRenderPipeline({
        layout: c.device.createPipelineLayout({bindGroupLayouts: [bgl]}),
        vertex: {module, entryPoint: 'vs'},
        fragment: {module, entryPoint: 'fs', targets: [{format: c.format}]},
        primitive: {topology: 'triangle-list'},
      });
      uniform = c.device.createBuffer({
        size: SLOTS * ALIGN,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      // Each slot holds a {time, gridN} Uniforms struct at its aligned offset.
      const floatsPerSlot = ALIGN / 4;
      const data = new Float32Array(SLOTS * floatsPerSlot);
      const t = nowSeconds();
      for (let s = 0; s < SLOTS; s++) {
        data[s * floatsPerSlot + 0] = t;
        data[s * floatsPerSlot + 1] = GRID_N;
      }
      c.device.queue.writeBuffer(uniform, 0, data);
      bindGroup = c.device.createBindGroup({
        layout: bgl,
        entries: [{binding: 0, resource: {buffer: uniform, size: 16}}],
      });
    },

    runFrame(count) {
      const encoder = ctx.device.createCommandEncoder();
      const view = ctx.context.getCurrentTexture().createView();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view,
            clearValue: {r: 0.04, g: 0.05, b: 0.08, a: 1},
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      });
      pass.setPipeline(pipeline);
      for (let i = 0; i < count; i++) {
        pass.setBindGroup(0, bindGroup, [(i % SLOTS) * ALIGN]);
        pass.draw(3, 1, 0, i);
      }
      pass.end();
      ctx.device.queue.submit([encoder.finish()]);
    },

    dispose() {
      uniform.destroy();
    },
  };
}
