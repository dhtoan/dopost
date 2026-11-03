# dopost Patch Policy

dopost stays close to the upstream codebase so future syncs stay practical. See [Upstream sync](openpost.md) for the steps.

- Put new product functionality in dopost-owned modules and packages.
- Patch upstream core only when no stable extension seam exists, and keep each patch small.
- Do not rewrite historical upstream migrations.
- Migration versions `9000`–`9099` are reserved for dopost. New files use `_dopost_` in the name; `9000_auno_*` and `9001_auno_*` keep their original names because installed databases record them.
- Saved identifiers from before the rename (`auno_*` tables, `track-auno-*` track ids, `auno-motion-composition-*` ids, the `auno:auto-video:` sidecar prefix, the `auno_auto_video_generate` job type, Docker volumes and `/data/db/auno-studio.db`) stay as they are so existing projects and databases keep working.
- `AUNO_*` environment variables are still read as fallbacks for the `DOPOST_*` names.
- Do not rename internal upstream package names, Go module paths, API types, protocol headers (`X-OpenPost-*`) or `OPENPOST_*` variables only for branding. User-facing text uses dopost; `scripts/dopost-brand.mjs` applies it.
