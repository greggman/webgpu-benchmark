# WebGPU Benchmark

A browser benchmark suite that measures the performance of the **WebGPU
implementation** — the CPU-side cost of issuing API calls, uploading data, and
encoding passes — rather than the raw throughput of the GPU.

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
| `mapAsyncRead` | big GPU→CPU readbacks via `mapAsync` |
| `writeTextureSmall` | many small (4×4) `writeTexture()` calls |
| `writeTextureBig` | many large (256×256) `writeTexture()` calls |
| `draw` | many `draw()` calls |
| `drawIndexed` | many `drawIndexed()` calls |
| `drawIndirect` | many `drawIndirect()` calls |
| `drawIndexedIndirect` | many `drawIndexedIndirect()` calls |
| `renderBundle` | replaying a medium render bundle many times |
| `dispatch` | many `dispatchWorkgroups()` calls |
| `interleavedPasses` | non-dependent interleaved render + compute passes |
| `createBindGroup` | bind-group creation churn (a fresh one per draw) |
| `setBindGroupDynamic` | rebinding one bind group with dynamic offsets |
| `setPipelineSwitch` | round-robin `setPipeline()` state changes |
| `renderPasses` | many `beginRenderPass()`/`end()` pairs |

## How it works

For each selected benchmark the runner does **init → warmup → calibrate →
measure**:

- **warmup** runs a few frames so the implementation can lazily create pipelines,
  buffers, and bind groups (those timings are discarded).
- **calibrate** picks a per-frame operation `count` sizing each submitted frame
  to a modest amount of work.
- **measure** keeps the GPU pipe full — the standard *frames-in-flight* pattern
  (up to 3 frames in flight, blocking only when that far ahead) — and reports the
  operations/second sustained over a fixed wall-clock window.

> **Why frames-in-flight and not "submit one frame, wait for it to finish"?**
> Draining the queue every frame measures *start + stop* latency, not throughput:
> it runs each frame from an idle GPU and never lets the implementation pipeline
> submissions the way a real engine does. It would also penalize an implementation
> that is fast under constant load but has higher per-submit latency. Keeping the
> pipe full measures sustained run speed. Each result also reports **CPU busy %**
> (how much of the window the CPU spent encoding vs. blocked on backpressure); a
> low value trips the **GPU-bound** flag, meaning the GPU/driver — not WebGPU's
> call path — was the bottleneck.

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
npm test         # Puppeteer smoke test (short measurement window per benchmark)
npm run typecheck
npm run baseline # regenerate src/ui/baseline.json from a full run on this machine
```

### Scoring baseline

Scores are normalized against `src/ui/baseline.json` (bundled at build time): a
score of ~1000 means "matches the baseline machine", and higher is better. To
recenter scoring on your own hardware, run:

```bash
npm run baseline   # runs the full suite headless, writes src/ui/baseline.json
npm run build      # rebuild to bundle the new baseline
```

The committed baseline was captured on an Apple M-series (Metal 3) GPU in
headless Chrome; regenerate to make it meaningful for your setup.

In the UI: choose benchmarks (all on by default) and click **Run selected**.
Results show per-benchmark scores and an overall score, with a **Download JSON**
button. Past runs are saved in **History** (`localStorage`), where each run can be
reloaded, labelled after the fact, downloaded, deleted, or added to the comparison.
You can also **drag & drop** exported JSON files into the *Compare runs* panel
(they're added to History too) to see per-benchmark deltas.

## Notes

- Requires a browser with WebGPU (`navigator.gpu`).
- `timestamp-query` is requested when available; the runner degrades gracefully
  without it.
- The scoring baseline lives in `src/ui/baseline.json`; regenerate it with
  `npm run baseline` (see *Scoring baseline* above).
