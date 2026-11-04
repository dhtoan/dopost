# dopost Notices

dopost includes and modifies third-party open-source software. This file records the attribution and licence notices that the AGPL-3.0 and MIT licences require.

## OpenPost

dopost is based on OpenPost and includes modified OpenPost source code.

- Source: https://github.com/getopenpost/openpost
- Original import commit: `d18b313e48ebd7311188d23c33044a9e9f1f77b7`
- Licence: GNU Affero General Public License v3.0 only (AGPL-3.0-only)

The licence text is kept at the repository root as `LICENSE` and under `licenses/openpost/LICENSE`. Copyright headers in source files are kept as written. dopost is distributed under the same AGPL-3.0-only terms.

## Bang Motion

The dopost Motion Engine adapts motion-design ideas from Bang Motion.

- Source: https://github.com/bangtutorial/bang-motion
- Pinned reference commit: `0f1bd1103835890354496d009af62885fe0a05d5`
- Licence: MIT
- Copyright: Copyright (c) 2026 Bang Tutorial

The pinned reference snapshot is kept under `third_party/bang-motion/`. The MIT notice is kept in that snapshot and at `licenses/bang-motion/LICENSE`. Runtime code does not import the vendored tree; it lives in dopost modules such as `packages/dopost-motion/`.

## AI/media models and runtimes

Code and model-weight licences must be recorded in `docs/compliance/third-party-inventory.md` before dopost adds new bundled weights, automatic downloads or release artifacts.

## Donkey Cut

Parts of the dopost video editor are adapted from Donkey Cut.

- Source: https://github.com/DonkeyCut/Donkey
- Reference commit: `cddf34f`
- Licence: Apache License 2.0
- Copyright: Copyright 2026 Donkey

The licence text is kept at `licenses/donkey/LICENSE`. Each adapted file starts with a note naming the Donkey Cut source file and saying it was modified. The Donkey Cut name, logo and media are not used.

### ACES 2.0 Output Transform

`apps/web/src/lib/video-editor/effects/aces-output.ts` came through Donkey Cut and restates the Academy's reference CTL for the ACES 2.0 Output Transform (https://github.com/aces-aswf/aces-core and https://github.com/aces-aswf/aces-output). Copyright Contributors to the ACES Project, Apache License 2.0; the file keeps its SPDX header and the licence text is at `licenses/APACHE-2.0.txt`.
