<div align="center">
  <h1>dopost</h1>
  <p><strong>AI-native content creation, motion design, and social publishing in one self-hosted workspace.</strong></p>
  <p>Turn ideas, documents, links, images, and footage into editable videos and channel-ready posts, then publish them and follow the results.</p>

  <p>
    <a href="https://github.com/dhtoan/dopost/releases"><img alt="GitHub release" src="https://img.shields.io/github/v/release/dhtoan/dopost?display_name=tag&include_prereleases&sort=semver&style=flat-square"></a>
    <a href="https://github.com/dhtoan/dopost/actions/workflows/dopost-phase4-release.yml"><img alt="Release gate" src="https://github.com/dhtoan/dopost/actions/workflows/dopost-phase4-release.yml/badge.svg?branch=main"></a>
    <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/dhtoan/dopost?style=flat-square"></a>
    <a href="https://github.com/dhtoan/dopost/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/dhtoan/dopost?style=flat-square"></a>
  </p>

  <p>
    <a href="https://github.com/dhtoan/dopost/releases">Releases</a>
    · <a href="apps/docs/content/docs/index.mdx">Documentation</a>
    · <a href="apps/docs/content/docs/self-hosting/index.mdx">Self-hosting</a>
    · <a href="https://github.com/dhtoan/dopost/issues">Issues</a>
  </p>
</div>

## Create without losing control

dopost brings AI-assisted creation into a native editing workflow. Generated content stays editable, so a first draft can become a finished production without leaving the workspace.

|                                                                      | Capability                  | What it does                                                                                                                    |
| -------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| <img src="assets/brand/features/ideas.svg" width="40" alt="">        | **Auto Video**              | Builds an editable video project from a prompt, document, URL, media selection, or structured idea.                             |
| <img src="assets/brand/features/video-editor.svg" width="40" alt=""> | **Documentary & Vox Style** | Turns research into ideas, scripts, timed beats, evidence-aware visuals, voice chunks, and motion compositions.                 |
| <img src="assets/brand/features/automation.svg" width="40" alt="">   | **dopost Motion Engine**    | Applies reusable motion language and deterministic compositions while keeping timing and creative controls editable.            |
| <img src="assets/brand/features/image-editor.svg" width="40" alt=""> | **Photo & Video Editors**   | Layers, multitrack timelines, captions, transitions, effects, timers, reusable blocks, audio, and export tools.                 |
| <img src="assets/brand/features/compose.svg" width="40" alt="">      | **Publishing**              | Adapts, previews, schedules, and publishes content across connected social channels, with polls, first comments, and approvals. |
| <img src="assets/brand/features/inbox.svg" width="40" alt="">        | **Unified Inbox**           | Comments, direct messages, mentions, and Google Business reviews in one place, with AI-drafted replies you review first.        |
| <img src="assets/brand/features/analytics.svg" width="40" alt="">    | **Analytics**               | Visibility totals, follower and engagement trends, custom date ranges, and CSV, Excel, or JSON export.                          |
| <img src="assets/brand/features/workflows.svg" width="40" alt="">    | **Workflows**               | Visual automations from RSS, GitHub releases, and published posts, with AI writing, review, and comment campaigns.              |
| <img src="assets/brand/features/workspaces.svg" width="40" alt="">   | **Connected Workspace**     | Media, accounts, calendars, inboxes, analytics, automations, clients, and collaborators together.                               |

## What's new in this release

- **Unified Inbox**: incoming mentions from Bluesky, Mastodon, and Threads; Google Business reviews and owner replies; AI replies drafted from approved product information; Instagram private replies; mark-all-read across pages.
- **Analytics**: a Visibility total that combines impressions and video views, last-year, all-time, and custom ranges, and CSV, Excel (with charts), or JSON export by post, day, week, month, platform, or account.
- **Instance backup and restore** for self-hosted installs, from **Settings → Instance → Backup and restore**.
- **Instagram without a Facebook Page**: connect Business and Creator accounts directly, or keep Facebook Login.
- **LinkedIn Community Management** for Pages and analytics.
- **Image Editor**: animated GIF layers with frame editing, light effects (flare, starburst, mist, prism, bokeh), per-page canvas sizes, layer-effect presets, and AI image generation and edits.
- **Clients and approvals**: a client role that can connect accounts and approve assigned posts, with approval reminders and expiry notices.
- **Workflows and Ideate**: a visual workflow editor, source-backed post series, and four complete post options from one idea.
- **Video Editor**: hosted editing assistant, recording clean-up, clip suggestions, timers, reusable blocks, track reordering, and audio detach.
- **Mobile readiness**: mobile Inbox with chats and comments, per-destination readiness in the composer, and server-published upload limits.
- **Languages**: Russian and Italian interface translations.

## Built for editable output

AI output should be a starting point, not a locked render. dopost creates native project state that you can refine in the editor: rearrange scenes, rewrite copy, retime voice, replace media, change motion, and export again.

- **Source-aware workflows**: carry evidence and creative intent from research into the final sequence.
- **Deterministic motion**: reproduce compositions consistently while keeping manual control.
- **Production continuity**: move from generation to editing, review, scheduling, and publishing in one system.
- **Self-hosted ownership**: run the application yourself and keep control of project data and media.

## Get started

### Use a release

Download the latest source bundle from [GitHub Releases](https://github.com/dhtoan/dopost/releases). Releases are alpha prereleases; read the [self-hosting documentation](apps/docs/content/docs/self-hosting/index.mdx) and test in your environment before production use.

### Run the development workspace

Requirements: [Bun 1.3.11](https://bun.sh/), Go, and the platform dependencies reported by the project doctor.

```bash
git clone https://github.com/dhtoan/dopost.git
cd dopost
bun install --frozen-lockfile
bun run doctor
bun run dev
```

Useful commands:

```bash
bun run check
bun run test
bun run build
```

## Technology

dopost uses Go for the backend and media services, with SvelteKit and TypeScript for the web app. Bun runs the JavaScript workspace. SQLite and local media storage are the simple self-hosted default; PostgreSQL and S3-compatible storage are available for larger deployments.

## Release status

dopost is in alpha. Alpha releases may include breaking API, configuration, or migration changes. Pin the exact release version, keep backups, and test upgrades before using them with important projects.

## Contributing

Bug reports and focused proposals are welcome through [GitHub Issues](https://github.com/dhtoan/dopost/issues). Include the version, deployment method, reproduction steps, expected result, and relevant logs with secrets removed.

## License

dopost is distributed under the [GNU Affero General Public License v3.0 only](LICENSE). Third-party components keep their own licences and notices; see [NOTICE.md](NOTICE.md) and the [licenses directory](licenses/README.md).
