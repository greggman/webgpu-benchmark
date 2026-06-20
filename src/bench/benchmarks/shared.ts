// Shared helpers for the draw-style benchmarks. The GPU work is deliberately
// trivial (3-vertex micro-triangles placed on a grid via instance_index) so the
// cost is dominated by issuing the draw/encode calls, not by rasterization.

import type { BenchContext } from '../types.js';

// Tiny triangle. Position offset + color are derived from instance_index, which
// each benchmark sets as `firstInstance` per draw — giving visual variety with
// zero extra API calls or GPU work.
export const MICRO_WGSL = /* wgsl */ `
struct Uniforms { time: f32, gridN: f32 };
@group(0) @binding(0) var<uniform> u: Uniforms;

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
  let wob = 0.3 * cell * sin(u.time * 2.0 + f32(ii) * 0.3);
  return vec4f(local[vi] + vec2f(cx + wob, cy), 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) p: vec4f) -> @location(0) vec4f {
  let t = u.time;
  return vec4f(0.5 + 0.5 * sin(t + p.x * 0.01),
               0.5 + 0.5 * sin(t * 1.3 + p.y * 0.01),
               0.8, 1.0);
}
`;

export interface MicroPipeline {
  pipeline: GPURenderPipeline;
  bindGroup: GPUBindGroup;
  uniform: GPUBuffer;
  gridN: number;
  setUniform(time: number): void;
  colorAttachment(): GPURenderPassColorAttachment;
  dispose(): void;
}

// Build the shared micro-triangle pipeline + per-frame uniform. `gridN^2` is the
// number of grid cells used to lay out instances for visual spread.
export function createMicroPipeline(ctx: BenchContext, gridN = 64): MicroPipeline {
  const { device, format } = ctx;
  const module = device.createShaderModule({ code: MICRO_WGSL });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });
  const uniform = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniform } }],
  });
  const data = new Float32Array([0, gridN]);

  return {
    pipeline,
    bindGroup,
    uniform,
    gridN,
    setUniform(time: number) {
      data[0] = time;
      device.queue.writeBuffer(uniform, 0, data);
    },
    colorAttachment(): GPURenderPassColorAttachment {
      return {
        view: ctx.context.getCurrentTexture().createView(),
        clearValue: { r: 0.04, g: 0.05, b: 0.08, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      };
    },
    dispose() {
      uniform.destroy();
    },
  };
}

// Monotonic seconds for animation, independent of wall clock specifics.
export function nowSeconds(): number {
  return performance.now() / 1000;
}

// An animated clear-only color attachment on the canvas, for benchmarks whose
// work is not rendering (uploads, compute) but which should still show motion.
export function animatedClear(ctx: BenchContext, time: number): GPURenderPassColorAttachment {
  return {
    view: ctx.context.getCurrentTexture().createView(),
    clearValue: {
      r: 0.05 + 0.05 * Math.sin(time),
      g: 0.06 + 0.05 * Math.sin(time * 1.3 + 1),
      b: 0.1 + 0.05 * Math.sin(time * 1.7 + 2),
      a: 1,
    },
    loadOp: 'clear',
    storeOp: 'store',
  };
}

// Encode a tiny animated clear pass so the canvas shows progress.
export function encodeAnimatedClear(ctx: BenchContext, encoder: GPUCommandEncoder, time: number): void {
  const pass = encoder.beginRenderPass({ colorAttachments: [animatedClear(ctx, time)] });
  pass.end();
}

export interface OffscreenTarget {
  texture: GPUTexture;
  view: GPUTextureView;
  colorAttachment(): GPURenderPassColorAttachment;
  dispose(): void;
}

// A small offscreen render target for benchmarks that render but should not fight
// over the canvas texture (e.g. many independent render passes).
export function createOffscreenTarget(ctx: BenchContext, size = 256): OffscreenTarget {
  const texture = ctx.device.createTexture({
    size: [size, size],
    format: ctx.format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
  const view = texture.createView();
  return {
    texture,
    view,
    colorAttachment(): GPURenderPassColorAttachment {
      return { view, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' };
    },
    dispose() {
      texture.destroy();
    },
  };
}

// A trivial compute pipeline + storage buffer: each invocation does negligible
// work, so dispatch cost reflects the WebGPU dispatch path, not GPU compute.
export const TRIVIAL_COMPUTE_WGSL = /* wgsl */ `
@group(0) @binding(0) var<storage, read_write> data: array<u32>;
@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x % arrayLength(&data);
  data[i] = data[i] + 1u;
}
`;

export interface TrivialCompute {
  pipeline: GPUComputePipeline;
  bindGroup: GPUBindGroup;
  dispose(): void;
}

export function createTrivialCompute(ctx: BenchContext): TrivialCompute {
  const { device } = ctx;
  const module = device.createShaderModule({ code: TRIVIAL_COMPUTE_WGSL });
  const pipeline = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'main' } });
  const buffer = device.createBuffer({ size: 256, usage: GPUBufferUsage.STORAGE });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer } }],
  });
  return { pipeline, bindGroup, dispose: () => buffer.destroy() };
}
