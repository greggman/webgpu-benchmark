// Adapter/device initialization, feature detection, and canvas configuration.

export interface GpuInit {
  adapter: GPUAdapter;
  device: GPUDevice;
  canvas: HTMLCanvasElement;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  adapterInfo: GPUAdapterInfo;
}

export class GpuUnsupportedError extends Error {}

// Request an adapter+device and configure the canvas context.
export async function initGpu(canvas: HTMLCanvasElement): Promise<GpuInit> {
  if (!('gpu' in navigator) || !navigator.gpu) {
    throw new GpuUnsupportedError('navigator.gpu is undefined');
  }

  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: 'high-performance',
  });
  if (!adapter) throw new GpuUnsupportedError('requestAdapter() returned null');

  const device = await adapter.requestDevice();

  const context = canvas.getContext('webgpu');
  if (!context)
    throw new GpuUnsupportedError('canvas.getContext("webgpu") returned null');

  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({device, format, alphaMode: 'opaque'});

  // Surface unexpected device-lost so it does not fail silently.
  void device.lost.then(info => {
    if (info.reason !== 'destroyed') {
      console.error('WebGPU device lost:', info.reason, info.message);
    }
  });

  return {
    adapter,
    device,
    context,
    canvas,
    format,
    adapterInfo: adapter.info,
  };
}
