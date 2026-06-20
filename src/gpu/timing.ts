// Small statistics + GPU timestamp helpers shared by the runner.

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Geometric mean of positive numbers; used for the overall score.
export function geomean(values: number[]): number {
  const positive = values.filter(v => v > 0);
  if (positive.length === 0) return 0;
  const sumLn = positive.reduce((acc, v) => acc + Math.log(v), 0);
  return Math.exp(sumLn / positive.length);
}

// Wraps a timestamp-query set so a render/compute pass can be timed on the GPU.
// Returns 0 ms when timestamps are unavailable.
export class GpuTimer {
  readonly enabled: boolean;
  private querySet?: GPUQuerySet;
  private resolveBuffer?: GPUBuffer;
  private readBuffer?: GPUBuffer;
  private lastMs = 0;
  private pending = false;

  constructor(device: GPUDevice, enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) return;
    this.querySet = device.createQuerySet({type: 'timestamp', count: 2});
    this.resolveBuffer = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
    });
    this.readBuffer = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
  }

  // Timestamp writes to attach to a pass descriptor, or undefined when disabled.
  timestampWrites(): GPURenderPassTimestampWrites | undefined {
    if (!this.enabled || !this.querySet) return undefined;
    return {
      querySet: this.querySet,
      beginningOfPassWriteIndex: 0,
      endOfPassWriteIndex: 1,
    };
  }

  // Resolve the timestamps into the read buffer at the end of an encoder.
  resolve(encoder: GPUCommandEncoder): void {
    if (
      !this.enabled ||
      !this.querySet ||
      !this.resolveBuffer ||
      !this.readBuffer
    )
      return;
    if (this.pending) return; // a read is already in flight; skip this frame
    encoder.resolveQuerySet(this.querySet, 0, 2, this.resolveBuffer, 0);
    encoder.copyBufferToBuffer(this.resolveBuffer, 0, this.readBuffer, 0, 16);
  }

  // Read the most recent pair asynchronously; updates `lastMs`. Safe to ignore.
  async read(): Promise<void> {
    if (!this.enabled || !this.readBuffer || this.pending) return;
    this.pending = true;
    try {
      await this.readBuffer.mapAsync(GPUMapMode.READ);
      const times = new BigUint64Array(
        this.readBuffer.getMappedRange().slice(0),
      );
      this.readBuffer.unmap();
      const deltaNs = Number(times[1] - times[0]);
      if (deltaNs >= 0) this.lastMs = deltaNs / 1e6;
    } catch {
      // ignore mapping races
    } finally {
      this.pending = false;
    }
  }

  get ms(): number {
    return this.lastMs;
  }

  dispose(): void {
    this.querySet?.destroy();
    this.resolveBuffer?.destroy();
    this.readBuffer?.destroy();
  }
}
