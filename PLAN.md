# WebGPU Benchmark — Build Plan

A browser benchmark suite that measures the performance of the **WebGPU implementation**
(the CPU-side cost of issuing API calls, uploading data, encoding passes, etc.) rather
than raw GPU compute/fill throughput. Inspired by 3DMark / MotionMark.

## 0. Guiding principle: measure WebGPU, not the GPU

Every benchmark must be **CPU/driver bound, not GPU bound**. The work done *per draw / per
dispatch / per upload* should be trivial for the GPU, so the wall-clock time is dominated by
the cost of the WebGPU API call path (validation, command encoding, queue submission, data
transfer). We verify this by checking that the score scales with *call count*, not with
*per-call GPU work*.

Concretely, for each benchmark:
- Geometry/shaders are tiny (e.g. a single triangle, a 1×1 viewport region, or a workgroup
  that does almost nothing).
- The variable we scale is the **number of API operations** (draws, dispatches, writeBuffers, …).
- We auto-tune that count during warmup so each benchmark runs at a sane frame rate on the
  host machine (see §4 calibration), keeping the GPU underutilized.

## 1. Tech stack & repo layout

- **TypeScript@latest**, bundled with **esbuild@latest**. No framework — plain DOM + WebGPU.
- **Dev server**: a tiny Node static server that picks a free port using the referenced
  `get-free-port.mjs` (copy it into `scripts/`).
- **Tests**: Puppeteer, headless Chrome with WebGPU enabled, a few frames per benchmark.
- **CI/CD**: GitHub Actions → build → run Puppeteer smoke test → publish `dist/` to GitHub Pages.

```
webgpu-benchmark/
  package.json
  tsconfig.json
  .github/workflows/deploy.yml
  scripts/
    get-free-port.mjs        # copied from sedon
    serve.mjs                # static server on a free port
    build.mjs                # esbuild build (bundle + copy index.html/css)
    dev.mjs                  # build --watch + serve
  src/
    index.html
    style.css
    main.ts                  # app entry: wires UI + runner
    gpu/
      device.ts              # adapter/device init, feature/limit checks, error scopes
      timing.ts              # frame timing, GPU timestamp-query (optional), stats
    bench/
      types.ts               # Benchmark interface, BenchResult types
      registry.ts            # list of all benchmarks
      runner.ts              # warmup → calibrate → measure loop
      benchmarks/
        copyExternalImage.ts
        writeBufferSmall.ts
        writeBufferBig.ts
        mapAsyncWrite.ts
        draw.ts
        drawIndexed.ts
        drawIndirect.ts
        drawIndexedIndirect.ts
        renderBundle.ts
        dispatch.ts
        interleavedPasses.ts
    ui/
      app.ts                 # selection UI, run button, progress
      results.ts             # score table, overall score
      storage.ts             # localStorage save/load by time+label
      compare.ts             # drag-and-drop JSON compare view
      score.ts               # scoring model (normalize → per-bench + overall)
  test/
    smoke.test.mjs           # puppeteer: run each bench a few frames, assert results
```

## 2. The Benchmark interface

A single shape every benchmark implements so the runner is generic.

```ts
interface BenchContext {
  device: GPUDevice;
  canvas: HTMLCanvasElement;
  context: GPUCanvasContext;   // for benches that present
  format: GPUTextureFormat;
}

interface Benchmark {
  id: string;                 // stable key for storage/compare
  name: string;               // human label
  description: string;
  // create GPU resources once; may be async (shader compile, image decode)
  init(ctx: BenchContext): Promise<void>;
  // do exactly `count` units of work for one frame (count = the thing we scale)
  runFrame(count: number): void;
  // cleanup buffers/textures/pipelines
  dispose(): void;
}
```

The "unit of work" (`count`) means: draws for `draw`, dispatches for `dispatch`,
writeBuffer calls for the upload benches, etc. **Higher score = better**, derived from how
many units/second the implementation sustains (see §5).

## 3. The 11 benchmarks (TODO list → concrete designs)

Each keeps GPU work trivial; we scale the call count.

1. **copyExternalImageToTexture** — decode a set of small `ImageBitmap`s once; each frame
   call `copyExternalImageToTexture` `count` times into a texture/atlas. Measures image
   import path cost.
2. **writeBuffer (small, many)** — `count` calls of `writeBuffer` with a tiny payload
   (e.g. 16 bytes) into different offsets. Measures per-call upload overhead.
3. **writeBuffer (big, many)** — `count` calls of `writeBuffer` with a large payload
   (e.g. 1–4 MB). Measures bulk staging/copy throughput via the queue.
4. **mapAsync write (big)** — ring of mappable upload buffers; each frame `await`/cycle
   maps, writes a big chunk, unmaps, and `copyBufferToBuffer`. Measures the map-based
   upload path. (Runner supports async frames for this one.)
5. **draw (many)** — one pipeline, tiny triangle; `count` `draw()` calls per render pass.
6. **drawIndexed (many)** — same, `drawIndexed()`.
7. **drawIndirect (many)** — `count` `drawIndirect()` calls from an indirect buffer.
8. **drawIndexedIndirect (many)** — `count` `drawIndexedIndirect()` calls.
9. **renderBundle (medium, replayed many)** — encode one medium render bundle once
   (e.g. a few hundred draws); each frame `executeBundles` it `count` times. Measures
   bundle replay efficiency.
10. **dispatchWorkgroups (many)** — trivial compute shader; `count` `dispatchWorkgroups()`
    calls in one compute pass.
11. **interleaved render+compute passes (non-dependent)** — alternate small render and
    compute passes with no data dependency between them; `count` pairs. Rewards
    implementations that parallelize independent passes.

> Note: the TODO lists these as 10-ish ideas; this is 11, satisfying "10 or so."

**Visual interest**: benches 5–9 and 11 render their tiny primitives to the canvas with
varied colors/positions so the screen shows moving, colorful output while running; upload/
compute benches (1–4, 10) visualize progress via an animated bar/sprite driven by the data
they move, so the user always sees something happening.

## 4. The runner: warmup → calibrate → measure

For each selected benchmark, in sequence:

1. **init** — create all resources. Wrap in `pushErrorScope`/`popErrorScope` to fail loudly.
2. **Warmup** — run a few frames (TODO requirement) at a low count so the implementation
   lazily creates pipelines/buffers/bind groups; discard these timings.
3. **Calibrate** — find a `count` that targets a stable per-frame time (e.g. aim ~8–12 ms
   of CPU encode time) using a quick doubling/bisection search. This keeps the GPU
   underused and the measurement CPU-bound. Record the chosen `count`.
4. **Measure** — run a fixed window (e.g. 2 seconds or N frames), record per-frame CPU time
   (`performance.now()` around `runFrame` + `queue.submit`) and, when available,
   `timestamp-query` GPU time. Compute units/sec = `count * frames / elapsed`.

Timing details:
- Primary metric is **CPU time to encode+submit** the work — that's the WebGPU-implementation
  cost. We also record GPU time (timestamp-query, if the feature exists) to confirm the GPU
  isn't the bottleneck; if GPU time ≈ frame time, flag the result as "GPU-bound, suspect."
- Use `device.queue.onSubmittedWorkDone()` between phases to keep phases clean.
- One `requestAnimationFrame` loop drives everything; the runner is a state machine so the
  UI stays responsive and can show progress.

## 5. Scoring (higher = better)

- Each benchmark produces **units/second** (e.g. draws/sec).
- Convert to a score: `score = unitsPerSecond / referenceUnitsPerSecond[id] * 1000`, where
  `referenceUnitsPerSecond` is a baked-in baseline (captured once on a reference machine) so
  ~1000 ≈ baseline and bigger is better. Baselines live in `score.ts` and are easy to retune.
- **Overall score** = geometric mean of per-benchmark scores (geomean avoids one bench
  dominating). Display per-bench scores + overall prominently.

## 6. UI / UX

- **Selection screen**: checklist of all benchmarks, **all checked by default**; Run button;
  optional "label" text field for this run.
- **Running**: progress (current bench, frame counter), live canvas, cancel.
- **Results**: table of per-benchmark scores + overall; expandable details (count used,
  CPU ms, GPU ms, units/sec, GPU-bound flag).
- **Save**: "Download JSON" produces `{ label, timestamp, ua, adapterInfo, results[] }` and
  also writes to **localStorage** keyed by `time + label`. A "History" panel lists saved runs.
- **Compare**: a drop zone — drag & drop 2+ JSON files (or pick from history) to render a
  side-by-side / grouped-bar comparison table per benchmark + overall, with deltas.

## 7. Build & serve scripts

- `scripts/build.mjs`: esbuild bundles `src/main.ts` → `dist/main.js` (ESM, minified for
  prod, sourcemap for dev), copies `index.html`/`style.css`, sets correct base path for
  GitHub Pages.
- `scripts/serve.mjs`: static file server; port via `getFreePort(8080, commonHosts)` from the
  copied `get-free-port.mjs`. Prints the URL.
- `scripts/dev.mjs`: esbuild `--watch` (or context.rebuild) + serve, for local dev.
- `package.json` scripts: `build`, `dev`, `serve`, `test`, `typecheck`.

## 8. Testing (Puppeteer)

- `test/smoke.test.mjs`: launch headless Chrome with WebGPU flags
  (`--enable-unsafe-webgpu`, `--enable-features=Vulkan`, appropriate for CI's GPU/SwiftShader),
  load the served page, run each benchmark in a **fast mode** (a few frames, no long measure
  window — expose a `?test=1` query or `window.__runQuick()` hook).
- Assert: every benchmark completes, produces a finite positive score, and emits no
  uncaptured WebGPU errors. Keep total runtime small.
- If hardware WebGPU is unavailable in CI, fall back to SwiftShader/`--use-angle=swiftshader`
  so the test still validates the API path (correctness, not perf).

## 9. GitHub Actions → Pages

`.github/workflows/deploy.yml`:
1. `actions/checkout`, `setup-node` (latest LTS), `npm ci`.
2. `npm run typecheck` + `npm run build`.
3. `npm test` (Puppeteer smoke; install Chrome via puppeteer).
4. Upload `dist/` artifact, deploy with `actions/deploy-pages` on push to `main`.
- Set the esbuild/HTML base path so assets resolve under the Pages subpath.

## 10. WebGPU best practices (applied throughout)

- Create pipelines, bind group layouts, buffers, and bind groups **once** in `init`, reuse
  per frame; never allocate in the hot loop.
- Use `GPUBuffer` with explicit usage flags; prefer staging rings for `mapAsync` bench.
- Batch into as few command encoders / passes as the bench's intent allows (except where the
  bench's *point* is many passes).
- Use `writeBuffer` for small/medium uploads, mapped buffers for the map bench.
- Handle device loss + `uncapturederror`; use error scopes during init.
- Query features/limits up front (timestamp-query optional, degrade gracefully).

## 11. Build order (milestones)

1. **Scaffold**: package.json, tsconfig, esbuild build/serve/dev scripts (free port), empty
   `index.html`, device init, a "hello triangle" to prove the pipeline. ✔ when page renders.
2. **Runner + 1 bench**: implement `Benchmark` interface, runner (warmup/calibrate/measure),
   and the `draw` benchmark end-to-end with a score. ✔ when a number comes out.
3. **All benchmarks**: implement the remaining 10, each with trivial GPU work + count scaling
   + a bit of visual output.
4. **Scoring + UI**: selection checklist, results table, overall geomean score.
5. **Persistence + compare**: JSON download, localStorage history, drag-and-drop compare view.
6. **Tests + CI**: Puppeteer quick mode, GitHub Actions, Pages deploy.
7. **Polish**: visuals, GPU-bound sanity flags, baseline tuning, README.

## Open questions / decisions to confirm

- **Scoring baselines**: ship a single reference baseline now and retune after first real
  runs (chosen default), vs. normalize each run to its own max (less comparable across runs).
- **GPU timestamp queries**: include as optional confirmation of CPU-bound-ness; gracefully
  skip if the feature is absent.
- **CI GPU**: hardware WebGPU is flaky on CI runners — plan assumes CI will run
on macos-latest which always has a GPU
