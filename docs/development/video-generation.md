# Video generation

`services/videogeneration` owns Video Editor generation. It follows the image generation lifecycle in [image-generation.md](image-generation.md): a user- and Workspace-scoped idempotency key admits the request, a saved job submits it to fal exactly once, the worker polls the receipt, imports the result through the normal Media pipeline, and reconciles cost from fal billing events.

## Models and inputs

`ai.VideoModels()` is the catalogue the API returns: Kling 4.0 Flash (default) and Kling 3.0 Pro, each with a text-to-video and an image-to-video endpoint. `ai.VideoInput` builds the endpoint input. Flash takes an integer duration and no audio flag; Pro takes a string duration and `generate_audio`. A start image sets the frame shape, so the aspect ratio is only sent for text prompts. The service rejects lengths, shapes and audio the chosen model does not support.

A start image must be a ready, untrashed PNG, JPEG or WebP in the same Workspace, either a library image or a Video Editor project asset, at least 300 px on each side and at most 10 MiB. It is read from `BlobStorage` at submission and sent inline as a data URI.

## Results

`ai.FalVideos` reads `video.url` from the result and downloads only from `*.fal.media` or `storage.googleapis.com`, without the provider key, up to 400 MiB. The worker checks for an MP4 `ftyp` box and imports the file with source `video_generation` and a stable Media ID derived from the run, so retries reuse one attachment. The handler timeout and lease cover a long download.

The browser follows the project's runs while the Media panel is open and imports each finished clip into the open project once, through the project's normal asset importer. Imported run IDs are remembered per project in browser storage, so a clip the user deletes is not imported again.

## Testing without fal

Development builds (`-tags dev`) with `OPENPOST_DOPOST_E2E_FIXTURES=1` replace fal with a fixture provider. It reports one `generating` poll, then completes with a three-second test clip and a zero cost. A prompt containing `fixture-reject` is refused at submission. Production builds refuse the flag.

## Configuration and migration

Set `FAL_KEY` or `FAL_KEY_FILE` on both web and worker roles; the key needs inference and billing-event access. Migration 9003 adds `video_generation_runs`. Rollback leaves the additive table in place; keep a worker running to finish accepted paid requests before removing the key.
