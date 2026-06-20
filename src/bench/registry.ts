// The list of all benchmarks. Order here is the default display/run order.
import type { Benchmark } from './types.js';
import { copyExternalImageBench } from './benchmarks/copyExternalImage.js';
import { writeBufferSmallBench } from './benchmarks/writeBufferSmall.js';
import { writeBufferBigBench } from './benchmarks/writeBufferBig.js';
import { mapAsyncWriteBench } from './benchmarks/mapAsyncWrite.js';
import { drawBench } from './benchmarks/draw.js';
import { drawIndexedBench } from './benchmarks/drawIndexed.js';
import { drawIndirectBench } from './benchmarks/drawIndirect.js';
import { drawIndexedIndirectBench } from './benchmarks/drawIndexedIndirect.js';
import { renderBundleBench } from './benchmarks/renderBundle.js';
import { dispatchBench } from './benchmarks/dispatch.js';
import { interleavedPassesBench } from './benchmarks/interleavedPasses.js';

export const benchmarks: Benchmark[] = [
  copyExternalImageBench,
  writeBufferSmallBench,
  writeBufferBigBench,
  mapAsyncWriteBench,
  drawBench,
  drawIndexedBench,
  drawIndirectBench,
  drawIndexedIndirectBench,
  renderBundleBench,
  dispatchBench,
  interleavedPassesBench,
];

export function benchmarkById(id: string): Benchmark | undefined {
  return benchmarks.find((b) => b.id === id);
}
