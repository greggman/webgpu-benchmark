# WebGPU Benchmark

A browser benchmark suite that measures the performance of the **WebGPU
implementation** — the CPU-side cost of issuing API calls, uploading data, and
encoding passes — rather than the raw throughput of the GPU. Inspired by 3DMark
and MotionMark.

> Why "not the GPU"? A shadertoy-style shader or a million-instance draw is bound
> by the GPU; it tells you little about the WebGPU layer. Each benchmark here keeps
> the per-call GPU work trivial and scales the **number of API operations**, so the
> measured cost reflects validation, command encoding, and queue submission.

## Benchmarks

| id | what it stresses |
|----|------------------|
| `copyExternalImage` | many `copyExternalImageToTexture()` calls |
| `writeBufferSmall` | many small `writeBuffer()` uploads |
| `writeBufferBig` | many large (1 MB) `writeBuffer()` uploads |
| `mapAsyncWrite` | big uploads via `mapAsync` + `copyBufferToBuffer` |
| `draw` | many `draw()` calls |
| `drawIndexed` | many `drawIndexed()` calls |
| `drawIndirect` | many `drawIndirect()` calls |
| `drawIndexedIndirect` | many `drawIndexedIndirect()` calls |
| `renderBundle` | replaying a medium render bundle many times |
| `dispatch` | many `dispatchWorkgroups()` calls |
| `interleavedPasses` | non-dependent interleaved render + compute passes |

## How it works

For each selected benchmark the runner does **init → warmup → calibrate →
measure**:

- **warmup** runs a few frames so the implementation can lazily create pipelines,
  buffers, and bind groups (those timings are discarded).
- **calibrate** picks a per-frame operation `count` targeting a modest flushed
  frame time, so the GPU stays under-utilized and the queue can't back up.
- **measure** records the CPU time to encode + submit the work (the WebGPU-impl
  cost) and reports operations/second.

Each benchmark's operations/second is normalized against a baked-in reference
baseline (`src/ui/score.ts`) so a score near **1000 matches the reference machine
and higher is better**. The **overall** score is the geometric mean of the
per-benchmark scores.

## Usage

```bash
npm install
npm run dev      # build + watch + serve on a free port
npm run build    # production build into dist/
npm run serve    # serve an existing dist/
npm test         # Puppeteer smoke test (a few frames per benchmark)
npm run typecheck
```

In the UI: choose benchmarks (all on by default), give the run a label, and click
**Run selected**. Results show per-benchmark scores and an overall score. You can
**Download JSON**, reload past runs from **History** (saved in `localStorage`), and
**drag & drop** two or more exported JSON files into the *Compare runs* panel to
see deltas.

## Deployment

`.github/workflows/deploy.yml` builds, typechecks, runs the smoke test (under
`xvfb` with SwiftShader), and publishes `dist/` to GitHub Pages on push to `main`.
The page uses relative asset paths, so it works under a project subpath.

## Notes

- Requires a browser with WebGPU (`navigator.gpu`).
- `timestamp-query` is requested when available; the runner degrades gracefully
  without it.
- Reference baselines are placeholders — retune `REFERENCE_UPS` after collecting
  real runs.
