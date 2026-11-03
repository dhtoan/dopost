# Upstream sync

dopost is built on the OpenPost codebase (AGPL-3.0-only). This page is for maintainers who pull upstream changes.

- Upstream repository: https://github.com/getopenpost/openpost
- Remote name: `upstream`
- Upstream branch: `main`
- Original import commit: `d18b313e48ebd7311188d23c33044a9e9f1f77b7`
- Last synced: upstream v7.37.1 (`4ae558f7f`), November 2026

## Syncing

Work on a branch and open a pull request; never merge straight into `main`.

```bash
git remote add upstream https://github.com/getopenpost/openpost.git 2>/dev/null || \
  git remote set-url upstream https://github.com/getopenpost/openpost.git
git fetch upstream main
git switch -c sync/upstream-$(date +%Y%m%d) origin/main
git merge upstream/main
```

1. Resolve conflicts. When a hunk only differs by the product name, take the upstream side; step 3 re-applies the name.
2. `apps/web/openapi.json` is merged key by key; regenerate types afterwards with `bun run --filter @openpost/web generate:types`.
3. Run `node scripts/dopost-brand.mjs`, then `node scripts/dopost-brand.mjs --check` (it should report 0 files).
4. Run `bun run check` and `bun run test`, and let CI run the Go suite.

On Windows, the tree has both `AGENTS.md` and `agents.md`. Exclude one with `git sparse-checkout set --no-cone '/*' '!/agents.md'` and stage files by path, not with `git add -u`.

Keep dopost functionality in its own modules (`$lib/dopost`, `packages/dopost-motion`, `internal/dopostmotion`). Do not rename internal OpenPost package names, Go module paths or `OPENPOST_*` variables only for branding; that turns every future sync into a large conflict.
