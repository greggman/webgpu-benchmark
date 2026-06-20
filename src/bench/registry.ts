// The list of all benchmarks. Order here is the default display/run order.
import type {Benchmark} from './types.js';
import {copyExternalImageBench} from './benchmarks/copyExternalImage.js';
import {writeBufferSmallBench} from './benchmarks/writeBufferSmall.js';
import {writeBufferBigBench} from './benchmarks/writeBufferBig.js';
import {mapAsyncWriteBench} from './benchmarks/mapAsyncWrite.js';
import {mapAsyncReadBench} from './benchmarks/mapAsyncRead.js';
import {writeTextureSmallBench} from './benchmarks/writeTextureSmall.js';
import {writeTextureBigBench} from './benchmarks/writeTextureBig.js';
import {drawBench} from './benchmarks/draw.js';
import {drawIndexedBench} from './benchmarks/drawIndexed.js';
import {drawIndirectBench} from './benchmarks/drawIndirect.js';
import {drawIndexedIndirectBench} from './benchmarks/drawIndexedIndirect.js';
import {renderBundleBench} from './benchmarks/renderBundle.js';
import {dispatchBench} from './benchmarks/dispatch.js';
import {interleavedPassesBench} from './benchmarks/interleavedPasses.js';
import {createBindGroupBench} from './benchmarks/createBindGroup.js';
import {setBindGroupDynamicBench} from './benchmarks/setBindGroupDynamic.js';
import {setPipelineSwitchBench} from './benchmarks/setPipelineSwitch.js';
import {renderPassesBench} from './benchmarks/renderPasses.js';

export const benchmarks: Benchmark[] = [
  copyExternalImageBench,
  writeBufferSmallBench,
  writeBufferBigBench,
  mapAsyncWriteBench,
  mapAsyncReadBench,
  writeTextureSmallBench,
  writeTextureBigBench,
  drawBench,
  drawIndexedBench,
  drawIndirectBench,
  drawIndexedIndirectBench,
  renderBundleBench,
  dispatchBench,
  interleavedPassesBench,
  createBindGroupBench,
  setBindGroupDynamicBench,
  setPipelineSwitchBench,
  renderPassesBench,
];

export function benchmarkById(id: string): Benchmark | undefined {
  return benchmarks.find(b => b.id === id);
}
