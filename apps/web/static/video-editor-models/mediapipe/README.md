# Video background removal: MediaPipe assets

Self-hosted files for the video editor's Remove background, which runs the
MediaPipe selfie segmenter on every frame in the browser.

- `vision_wasm_internal.js`, `vision_wasm_internal.wasm`: the SIMD WebAssembly
  runtime from `@mediapipe/tasks-vision` 0.10.21
  (https://github.com/google-ai-edge/mediapipe), Apache License 2.0.
- `selfie_segmenter.tflite`: Google's MediaPipe Selfie Segmentation model
  (square, float16), Apache License 2.0; published at
  https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite
  with its model card at https://developers.google.com/mediapipe/solutions/vision/image_segmenter.

The Apache License 2.0 text is at `licenses/APACHE-2.0.txt` in the repository.
When upgrading `@mediapipe/tasks-vision`, copy both runtime files from its
`wasm/` folder together and bump the cache name in `apps/web/vite.config.ts`.
