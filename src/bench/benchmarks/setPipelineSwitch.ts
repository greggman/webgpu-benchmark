// Benchmark: pipeline switching. A handful of pipelines (sharing one layout, but
// each made distinct via an override constant) are bound in round-robin across
// `count` draws. Measures the per-setPipeline state-change/validation cost.
import type {Benchmark, BenchContext} from '../types.js';
import {nowSeconds} from './shared.js';

const PIPELINES = 8;
const GRID_N = 64;

// Like the micro shader, but with an override constant so each pipeline is
// genuinely distinct (the implementation cannot collapse the state changes).
const WGSL = /* wgsl */ `
struct Uniforms { time: f32, gridN: f32 };
@group(0) @binding(0) var<uniform> u: Uniforms;
override tint: f32 = 0.0;

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32)
  -> @builtin(position) vec4f {
  let local = array<vec2f, 3>(vec2f(0.0, 0.012), vec2f(-0.012, -0.012), vec2f(0.012, -0.012));
  let n = u.gridN;
  let col = f32(ii % u32(n));
  let row = f32((ii / u32(n)) % u32(n));
  let cell = 2.0 / n;
  let cx = -1.0 + cell * (col + 0.5);
  let cy = -1.0 + cell * (row + 0.5);
  return vec4f(local[vi] + vec2f(cx, cy), 0.0, 1.0);
}

@fragment
fn fs() -> @location(0) vec4f {
  return vec4f(0.5 + 0.5 * sin(u.time + tint * 6.28),
               0.5 + 0.5 * cos(u.time + tint * 3.14),
               0.8, 1.0);
}
`;

export const setPipelineSwitchBench: Benchmark = createBench();

function createBench(): Benchmark {
  let ctx: BenchContext;
  let pipelines: GPURenderPipeline[];
  let bindGroup: GPUBindGroup;
  let uniform: GPUBuffer;
  const data = new Float32Array([0, GRID_N]);

  return {
    id: 'setPipelineSwitch',
    name: 'setPipeline() switch x N',
    description: `Round-robin ${PIPELINES} pipelines across N draws.`,
    unit: 'pipeline binds',

    async init(c) {
      ctx = c;
      const module = c.device.createShaderModule({code: WGSL});
      const bgl = c.device.createBindGroupLayout({
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: {type: 'uniform'},
          },
        ],
      });
      const layout = c.device.createPipelineLayout({bindGroupLayouts: [bgl]});
      pipelines = Array.from({length: PIPELINES}, (_, k) =>
        c.device.createRenderPipeline({
          layout,
          vertex: {module, entryPoint: 'vs'},
          fragment: {
            module,
            entryPoint: 'fs',
            targets: [{format: c.format}],
            constants: {tint: k / PIPELINES},
          },
          primitive: {topology: 'triangle-list'},
        }),
      );
      uniform = c.device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      bindGroup = c.device.createBindGroup({
        layout: bgl,
        entries: [{binding: 0, resource: {buffer: uniform}}],
      });
    },

    runFrame(count) {
      data[0] = nowSeconds();
      ctx.device.queue.writeBuffer(uniform, 0, data);
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
      pass.setBindGroup(0, bindGroup);
      for (let i = 0; i < count; i++) {
        pass.setPipeline(pipelines[i % PIPELINES]);
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
