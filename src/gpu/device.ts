// Adapter/device initialization, feature detection, and canvas configuration.

export interface GpuInit {
  adapter: GPUAdapter;
  device: GPUDevice;
  canvas: HTMLCanvasElement;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  hasTimestamp: boolean;
  adapterInfo: GPUAdapterInfo;
}

export class GpuUnsupportedError extends Error {}

// Request an adapter+device and configure the canvas context. Requests the
// optional `timestamp-query` feature when available so the runner can confirm
// benchmarks are CPU-bound; degrades gracefully when it is not present.
export async function initGpu(canvas: HTMLCanvasElement): Promise<GpuInit> {
  if (!('gpu' in navigator) || !navigator.gpu) {
    throw new GpuUnsupportedError('navigator.gpu is undefined');
  }

  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: 'high-performance',
  });
  if (!adapter) throw new GpuUnsupportedError('requestAdapter() returned null');

  const hasTimestamp = adapter.features.has('timestamp-query');
  const requiredFeatures: GPUFeatureName[] = hasTimestamp
    ? ['timestamp-query']
    : [];

  const device = await adapter.requestDevice({requiredFeatures});

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
    hasTimestamp,
    adapterInfo: adapter.info,
  };
}
