# WebGPU Benchmark

This project is a benchmark for WebGPU. It takes inspiration from
benchmarks like 3dMark and MotionMark.

* It should have 10 or so benchmarks

* The benchmarks should be visually interesting

* The benchmarks must test the performance of WebGPU, NOT the performance of the GPU itself.

  For example, a shadertoy type shader tests the performance of the GPU itself. It does
  not test the performance of the WebGPU implementation because all it's doing is making
  a few, usually 1, draw call. Everything is dependent on the GPU itself so that is not
  useful as a WebGPU benchmark. It's only useful as a GPU benchmark

  Similarly, a demo the draws 1000000 instanced objects is benchmarking the GPU, not WebGPU.

* Ideas for the benchmarks

  * importing images via `copyExternalImageToTexture`
  * uploading small data many times via `writeBuffer`
  * uploading big data many times via `writeBuffer`
  * uploading big data via mapAsync write
  * calling `draw` many times
  * calling `drawIndexed` many times
  * calling `drawIndirect` many times.
  * calling `drawIndexedIndirect` many times
  * executing a medium sized renderBundle many times
  * calling `dispatchWorkgroups` many times
  * non-dependent interleaved usages of render passes and compute passes (some implementation will parallelize these)

* The benchmarks should use WebGPU best practices.
* The benchmarks should have a warm up period (a few frames) so that
  the WebGPU implementation has a moment to create resources.

* The benchmark should have UX that lets you select which benchmarks to run, defaulting to all
* The result should provide an overall score and a per benchmark score where higher is better
* The benchmarks should have a way to save to a JSON file with use supplied label
* The benchmarks should save the results by time and label to localstorage
* There should be a way to compare 2 or more runs by dragging and dropping JSON files
  and selecting runs from local storage.

# Some requirements

* Use TypeScript@latest
* Use esbuild at the latest version
* Look for a free port for the server (see /Users/gregg/src/sedon/scripts/get-free-port.mjs)
* make github actions to publish to github pages
* Use puppeteer to test (a few frames per benchmark so it runs fast)
