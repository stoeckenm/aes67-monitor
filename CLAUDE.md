# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

AES67 Stream Monitor — an Electron + Vue 3 desktop app that discovers AES67/RAVENNA/ST 2110-30 audio-over-IP streams via SAP and plays selected channels through a local audio device (via `audify`/RtAudio).

The UI is German (`vue-i18n`, `src/locales/de.json` is the source of truth, `en.json` is kept at key parity). It has **two deliberately separate shells**: non-technical operators see only large channel tiles, admins get the technical views. See "Two shells" below.

## Commands

```bash
npm install                  # audify and electron fetch binaries from github.com
npm run dev                  # Vite dev server on port 8888 (alias: npm run serve)
npm start                    # launch Electron against localhost:8888
npm test                     # Vitest, run once
npm run test:watch
npm run lint                 # ESLint flat config
npm run format               # prettier --write .
npm run build                # vite build && electron-builder --win --x64
npm run build-renderer       # renderer only, no packaging (works without the electron binary)
npm run build-electron-only  # repackage without rebuilding the renderer
```

Development needs **two** terminals: `npm run dev` and `npm start`. `main.js` loads `http://localhost:8888` when not packaged and `./dist/index.html` when packaged, so the Vite port in `vite.config.mjs` and that URL must stay in step.

Run a single test file: `npx vitest run tests/sdpParse.test.js`. A single case: `npx vitest run -t "defaults a missing ptime"`.

Builds and the CI release workflow (`.github/workflows/build.yml`, triggered by `v*` tags) are **Windows x64 only**, though the runtime code supports macOS and Linux.

## Architecture: four processes

1. **Electron main** (`main.js` + `backend/`) — windowing, config persistence, device enumeration, IPC router, worker supervision.
2. **Renderer** (`src/`) — Vue 3 with `<script setup>`, Pinia, vue-i18n. No router.
3. **`src/lib/sdp.js`** — forked worker. SAP discovery on UDP 9875 / `239.255.255.255`.
4. **`src/lib/audio.js`** — forked worker. RTP receive + RtAudio playback.

Both workers are supervised: `spawnWorker` in `main.js` respawns them with backoff and reports failures to the renderer. After a respawn the worker is re-seeded (interface, delete timeout, manual streams) on the next `updateSystem` pass.

### Build boundary

Vite covers the **renderer only**. `main.js`, `preload.js`, `backend/**` and `src/lib/**` stay plain CommonJS that Electron loads directly — they are not bundled and must not use ESM or the `@/` alias. `electron-vite` was deliberately not used, because bundling main would fight with the workers being forked by path and with the native `audify` binding.

Config files are `.mjs` (`vite.config.mjs`, `eslint.config.mjs`) on purpose: adding `"type": "module"` to `package.json` would reinterpret every CommonJS file above as an ES module.

New files under `src/lib/` need no build change; new top-level directories need an `electron-builder.yml` `files:` entry.

### Message flow

Renderer → main: `src/ipc/bridge.js` (the only place that touches `window.electronAPI`) → `preload.js` → `ipcMain.on("recv-message")` → `backend/ipc/ipcHandler.js` → forwarded to a worker.

Main → renderer: `sendMessage(type, data)` in `main.js` → `"send-message"` → the switch in `src/ipc/receiver.js`.

Request/response goes through `invoke`: `get-shared-config`, `verify-admin-password`, `set-admin-password`.

**Adding a message touches up to three switch statements**: `backend/ipc/ipcHandler.js`, `src/ipc/receiver.js`, and the `process.on("message")` switch in the relevant worker.

## Two shells

`src/App.vue` picks a whole layout, it does not hide pieces of one:

- `layouts/OperatorLayout.vue` → only `views/ChannelsView.vue` (large tiles, play/stop, offline state) plus the lock button. No navigation, no multicast addresses, no codecs.
- `layouts/AdminLayout.vue` → sidebar navigation and the technical views.

`adminMode` lives in `stores/session.js` and is **never persisted**: a kiosk machine has to come back up locked. Without a configured password the lock opens without asking, which `SettingsView` states explicitly.

The password is verified in the main process (`backend/system/password.js`, scrypt + salt + `timingSafeEqual`); the renderer only learns `hasPassword`. Legacy unsalted SHA-256 hashes are migrated on first successful use. It is a guard against accidental operation, not access control.

## Pinia stores (`src/stores/`)

| store       | owns                                                                          |
| ----------- | ----------------------------------------------------------------------------- |
| `session`   | `adminMode`, current page, search term, `selectedStreamId`, last error        |
| `config`    | `persistent` and `user` config, debounced saves, friendly names, device names |
| `discovery` | live streams, network interfaces, audio devices, filtering                    |
| `favorites` | favorite references, resolved against discovery                               |
| `playback`  | what is playing, channel/media selection, play/stop                           |

Two invariants worth knowing:

- **Streams are merged by id**, never replaced (`discovery.applyStreams`). Object identity has to survive a discovery update, and the open detail page looks the stream up by `selectedStreamId` rather than holding a reference.
- **Nothing writes to a store during render.** `channelOptions` is pure; defaults are set by a watcher in `playback.watchDiscovery()`. Filtering is a computed, and counts derive from it.

`config` installs deep watchers that save 300 ms after any mutation. `applyFromMain` suppresses them while a push from main is applied, otherwise the two bounce saves off each other.

## Configuration: two stores

|                  | file                                                                                                                                                                                | scope             |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `persistentData` | Windows `%ProgramData%\StreamMonitor\config.json`; macOS `/Library/Application Support/StreamMonitor`; Linux `/etc/StreamMonitor` — each with a per-user fallback when not writable | machine-wide      |
| `userData`       | `<appData>/StreamMonitor/user.json`                                                                                                                                                 | per-user UI state |

`backend/config/paths.js` probes writability and falls back, because the old fixed `/etc/StreamMonitor` needed root and failed silently.

Defaults are **duplicated** in `backend/config/defaults.js` and in `stores/config.js` — change both. Pure merge and migration logic is in `backend/persistence/migrate.js` (no electron import, so it is unit tested).

**Main-owned keys** that `savePersistent` deliberately ignores from the renderer: `passwordHash`, `network`, `manualStreams`. Trusting the renderer's copy of these wipes or reverts them.

Migrations run once on load and back up the previous file to `config.json.bak`: `devices` array → map keyed by IP, favorites → `{ id, order }` references with any `friendlyName` moved into `streamNames`.

## Data shapes worth knowing

- **Favorites** are references, `{ id, order }`. Live data is resolved in `stores/favorites.js`. A favorite whose stream is not announced stays visible and is marked offline — an operator needs to see that a channel is gone, not an empty page.
- **Friendly names** live in `persistentData.streamNames` keyed by stream id, not on stream objects, which discovery replaces.
- **Manual streams** are persisted in `persistentData.manualStreams` and replayed into the worker after init. Main mirrors them _out of_ the worker's session list, and suspends mirroring until the replay has happened — a freshly respawned worker reports an empty list, and mirroring that would erase them.

## Settings presentation

`src/config/presets.js` maps the stored values onto named choices without changing the stored shape: buffer levels (off/low/standard/stable, else `custom`) and discovery timeouts (60 s / 300 s / `0` = never). `effectiveBufferSize()` mirrors the worker's `outSampleFactor`, because the worker silently raises the jitter buffer for short packet times and the UI should not appear to lie.

A `sdpDeleteTimeout` of `0` means "keep until announced as deleted"; the worker checks for it explicitly.

## Audio path (`src/lib/audio.js`)

- Output is always 2-channel SINT16; `ch1Map`/`ch2Map` pick the source channels and are clamped to the stream's channel count. L24 is read as its upper 16 bits.
- Packets go into a 1024-slot ring indexed by RTP sequence number; `jitterBufferSize` is the read lag. The initial index uses a positive modulo — a negative one read from the end of the buffer.
- `outSampleFactor` is raised until at least 48 samples are written per call, and raises the jitter buffer with it. Short `ptime` (0.125 ms) streams depend on this.
- `resolveFormat()` validates samplerate, channels and `ptime` up front. A missing `a=ptime` is legal and defaults to 1 ms; a `samplesPerPacket` of 0 would spin the `outSampleFactor` loop forever.
- Device selection matches on **name + inputChannels + outputChannels**, never on `id` (RtAudio ids are not stable). RtAudio is instantiated twice: `backend/system/audio.js` enumerates (cached, published only on change), `src/lib/audio.js` plays.
- There is no backpressure control: audify exposes no queue depth, and `getStreamLatency()` is the device's fixed latency. One output packet is written per input packet, so the sender paces playback; clock drift would need resampling.

## SAP/SDP (`src/lib/sdp.js`, `src/lib/sdpParse.js`)

- Pure parsing lives in `sdpParse.js` so it can be tested without opening sockets.
- Sessions are keyed by MD5 of the SDP `origin`. SAP header bit `0x4` means deletion.
- Updates are **coalesced** into one message per 250 ms; user-initiated changes (add, delete, interface switch, refresh) flush immediately.
- Manual streams are never overwritten by announcements and never expire. `announce: true` streams are re-broadcast every 30 s with a random SAP message id (Dante Controller needs that).
- `isSupportedStream` gates on audio/`RTP/AVP`, exactly one rtpmap, L16/L24, 1–64 channels, and a known sample rate. It also normalizes a mono `rtpmap` without a channel count (`L16/48000`) to 1 channel — leaving it undefined made the playback worker derive a NaN packet size and silently drop everything.
- Dante detection reads `a=keywds:Dante`, which sdp-transform surfaces as `keywords`.

## Testing

Vitest, `tests/`. Node environment by default; component tests opt into jsdom with `// @vitest-environment jsdom`. No E2E — Electron plus the native `audify` binding in CI is not worth it.

Coverage is deliberately on the pure logic and the regressions: SDP support gating, the password module, config merges and migrations, the settings presets, favorite resolution, and a mount smoke test per shell (including that a stream name containing markup is escaped).

**Audio playback and SAP discovery cannot be verified in CI or on a dev machine without AES67 traffic.** Verify against hardware or GStreamer streams per the README matrix and [philhartung/aoip-tester](https://github.com/philhartung/aoip-tester).

## Gotchas

- The repo has **mixed line endings** (`.js` and `.vue` are CRLF, JSON is LF) and no `.gitattributes`. Prettier normalizes to LF and will rewrite every line of a CRLF file, producing an enormous diff. Check `git diff --stat` after formatting.
- `vuedraggable` must stay on `^4.1.0`. Its `latest` tag is `2.24.3`, the Vue 2 line.
- The CSP in `applyContentSecurityPolicy()` lists the `file:` scheme explicitly, because the packaged renderer loads over `file://` where Chromium does not treat `'self'` as matching. Removing it blanks the packaged window.
- `sandbox: true` is on, so `preload.js` must use `require("electron")` — the `electron/renderer` subpath is not available in a sandboxed preload.
