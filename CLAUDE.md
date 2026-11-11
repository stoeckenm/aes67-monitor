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
- `layouts/AdminLayout.vue` → sidebar navigation and the technical views: **Übersicht** (`OverviewView`), **Kanäle** (`ChannelsAdminView`), **Streams** (`StreamsView`), **Sender** (`SendersView`), **Audiogeräte** (`AudioDevicesView`), **Einstellungen** (`SettingsView`), plus the `stream` and `sdp` detail pages.

`ChannelsView.vue` is the operator's screen and takes no part in configuring anything. The admin side mounts it a second time as a read-only preview with `editable` set, which only enables dragging. It used to branch on `adminMode` in four places and serve both audiences at once.

The admin navigation is ordered by task, not by data store, and every badge means the same thing: how many rows that page will show. The Streams badge was the unfiltered total while the page showed the filtered list, so the two contradicted each other whenever a filter was active.

"Sender" is deliberately not "Geräte": the output device in the settings is a device too, and one word for both sent admins looking in the wrong place.

`adminMode` lives in `stores/session.js` and is **never persisted**: a kiosk machine has to come back up locked. Without a configured password the lock opens without asking, which `SettingsView` states explicitly.

The password is verified in the main process (`backend/system/password.js`, scrypt + salt + `timingSafeEqual`); the renderer only learns `hasPassword`. Legacy unsalted SHA-256 hashes are migrated on first successful use. It is a guard against accidental operation, not access control.

## Pinia stores (`src/stores/`)

| store       | owns                                                                                           |
| ----------- | ---------------------------------------------------------------------------------------------- |
| `session`   | `adminMode`, current and previous page, search term, `senderFilter`, `selectedStreamId`, error |
| `config`    | `persistent` and `user` config, debounced saves, friendly names, sender names, settings tab    |
| `discovery` | live streams, interfaces, audio devices, `audioSelection`, filtering, `senders`, tallies       |
| `channels`  | channel references, resolved against discovery, order                                          |
| `playback`  | what is playing, channel/media selection, play/stop                                            |

Three invariants worth knowing:

- **Streams are merged by id**, never replaced (`discovery.applyStreams`). Object identity has to survive a discovery update, and the open detail page looks the stream up by `selectedStreamId` rather than holding a reference.
- **Nothing writes to a store during render.** `channelOptions` is pure; defaults are set by a watcher in `playback.watchDiscovery()`. Filtering is a computed, and counts derive from it.
- **The search term belongs to the page it was typed on.** `session.setPage` clears it, except when stepping into a detail page (`stream`, `sdp`) and back: a term that survived a page change left a filter active that nothing on screen explained, and losing it on every Details click made the table unusable. `senderFilter` has the same lifetime and is its own state, never a pre-filled search box.

`config` installs deep watchers that save 300 ms after any mutation. `applyFromMain` suppresses them while a push from main is applied, otherwise the two bounce saves off each other.

## Configuration: two stores

|                  | file                                                                                                                                                                                | scope             |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `persistentData` | Windows `%ProgramData%\StreamMonitor\config.json`; macOS `/Library/Application Support/StreamMonitor`; Linux `/etc/StreamMonitor` — each with a per-user fallback when not writable | machine-wide      |
| `userData`       | `<appData>/StreamMonitor/user.json`                                                                                                                                                 | per-user UI state |

`backend/config/paths.js` probes writability and falls back, because the old fixed `/etc/StreamMonitor` needed root and failed silently.

Defaults are **duplicated** in `backend/config/defaults.js` and in `stores/config.js` — change both. Pure merge and migration logic is in `backend/persistence/migrate.js` (no electron import, so it is unit tested).

**Main-owned keys** that `savePersistent` deliberately ignores from the renderer: `passwordHash`, `network`, `manualStreams`, and inside `settings` both `audioInterface` and `storedAudioInterface`. Trusting the renderer's copy of these wipes or reverts them — for the two audio keys that means a pinned device quietly losing its pin, because main resolves the active device on a timer while the renderer holds a snapshot.

Migrations run once on load and back up the previous file to `config.json.bak`: `devices` array → map keyed by IP, favorites → `{ id, order }` references with any `friendlyName` moved into `streamNames`.

## Data shapes worth knowing

- **Channels** are references, `{ id, order }`. Live data is resolved in `stores/channels.js`. A channel whose stream is not announced stays visible and is marked offline — an operator needs to see that a channel is gone, not an empty page. The **persisted key is still `persistentData.favorites`**: the vocabulary moved to "channel", the stored shape did not. Renaming the key would need a migration for nothing the user can see, and getting it wrong drops every configured channel on the first start after an update.
- **Friendly names** live in `persistentData.streamNames` keyed by stream id, not on stream objects, which discovery replaces. The display name is editable both on the stream detail page and inline in the channel list, because it is the one field an operator actually reads.
- **Manual streams** are persisted in `persistentData.manualStreams` and replayed into the worker after init. Main mirrors them _out of_ the worker's session list, and suspends mirroring until the replay has happened — a freshly respawned worker reports an empty list, and mirroring that would erase them.

## Settings presentation

The tabs are grouped by subsystem, not by technology: **Wiedergabe** is everything affecting what comes out of this machine (output device, jitter buffer), **Netzwerk** everything affecting what it listens for (adapter, discovery timeout), **Zugang** the password. The active tab is persisted in `userData.settings.settingsTab`; a local `ref` reset it on every navigation.

`src/config/presets.js` maps the stored values onto named choices without changing the stored shape: buffer levels (off/low/standard/stable, else `custom`) and discovery timeouts (60 s / 300 s / `0` = never). `effectiveBufferSize()` mirrors the worker's `outSampleFactor`, because the worker silently raises the jitter buffer for short packet times and the UI should not appear to lie.

A `sdpDeleteTimeout` of `0` means "keep until announced as deleted"; the worker checks for it explicitly.

## Audio path (`src/lib/audio.js`)

- Output is always 2-channel SINT16; `ch1Map`/`ch2Map` pick the source channels and are clamped to the stream's channel count. L24 is read as its upper 16 bits.
- Packets go into a 1024-slot ring indexed by RTP sequence number; `jitterBufferSize` is the read lag. The initial index uses a positive modulo — a negative one read from the end of the buffer.
- `outSampleFactor` is raised until at least 48 samples are written per call, and raises the jitter buffer with it. Short `ptime` (0.125 ms) streams depend on this.
- `resolveFormat()` validates samplerate, channels and `ptime` up front. A missing `a=ptime` is legal and defaults to 1 ms; a `samplesPerPacket` of 0 would spin the `outSampleFactor` loop forever.
- Device selection matches on **name + inputChannels + outputChannels**, never on `id` (RtAudio ids are not stable). RtAudio is instantiated twice: `backend/system/audio.js` enumerates (cached, published only on change), `src/lib/audio.js` plays.
- **Which output device is in effect is decided in exactly one place**, the pure `backend/system/audioSelection.js` (`resolveOutput`), and the precedence is: `followSystemAudio` → the system default; otherwise the **preferred device** (`settings.storedAudioInterface`) whenever it is present; otherwise the last device asked for by hand; otherwise the system default. That is what makes a USB headset take over again by itself when it is plugged back in — `updateSystem` re-resolves every 5 s, and the match on name plus channel counts survives the id changing.
- The same module's `listForRenderer` keeps a **preferred device that is unplugged in the published list**, flagged `absent`. It is the only place the preference can be seen and removed, and the operator needs to notice that the device is gone.
- `setAudioInterface` carries the reason for its answer (`system`, `pinned`, `fallback`, `manual`, `default`, `none`) and publishes it as `audioSelection`. The renderer puts words to it in `src/utils/audioStatus.js` and never re-derives the precedence; that is how the page and the behaviour would drift apart. A selection that cannot take effect is stated as such rather than silently ignored — the old device list looked broken because a pinned device overrode every click without saying so.
- Pinning a device clears `followSystemAudio`: the two are contradictory wishes and following the system won silently. The preference is main-owned and set through `setPreferredAudioInterface`, not through the settings save, which would race the renderer's 300 ms debounce.
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

Coverage is deliberately on the pure logic and the regressions: SDP support gating, the password module, config merges and migrations, the settings presets, channel resolution and ordering, the navigation guard predicate, the output-device precedence and its labels, the search and sender-filter lifetime in `session`, the relative-time label, locale key parity, and a mount smoke test per shell (including that a stream name containing markup is escaped, and that the admin pages keep playback configuration out of the streams table).

**Audio playback and SAP discovery cannot be verified in CI or on a dev machine without AES67 traffic.** Verify against hardware or GStreamer streams per the README matrix and [philhartung/aoip-tester](https://github.com/philhartung/aoip-tester).

## Gotchas

- The repo has **mixed line endings** and no `.gitattributes`. Everything rewritten during the overhaul is LF; still CRLF are `main.js`, `src/lib/sdpParse.js`, everything under `backend/` except `persistence/migrate.js` and `system/navigation.js`, plus `package.json` and `package-lock.json`. Prettier normalizes to LF, so `npm run format` rewrites every line of those files, and `npm install` silently flips both package files to LF — which alone turns the lockfile diff from ~300 lines into ~14000. Check `git diff --stat` after either, and convert back rather than committing the flip. `npx prettier --check .` is already red on those files at HEAD; that is expected, not a regression.
- `vuedraggable` must stay on `^4.1.0`. Its `latest` tag is `2.24.3`, the Vue 2 line.
- The CSP in `applyContentSecurityPolicy()` lists the `file:` scheme explicitly, because the packaged renderer loads over `file://` where Chromium does not treat `'self'` as matching. Removing it blanks the packaged window.
- The CSP covers script sources but **not navigation**. `applyNavigationGuards()` denies `window.open`, blocks `will-navigate` to anything outside the app's own bundle and refuses webview attachment. It is registered on `web-contents-created` before the first window exists, so every `webContents` is covered. The predicate itself lives in `backend/system/navigation.js` (`isUrlWithinApp`), electron-free and unit tested, because getting it wrong either blanks the window or lets a crafted stream name navigate the renderer away.
- `sandbox: true` is on, so `preload.js` must use `require("electron")` — the `electron/renderer` subpath is not available in a sandboxed preload.
- **Electron 45 has no `postinstall`.** The binary is fetched lazily on the first `require("electron")`, i.e. on `npm start`, not during `npm install`. Behind a proxy that fails with `TypeError: fetch failed`, because `@electron/get` v5 downloads with Node's global `fetch` and undici ignores `HTTP_PROXY`/`HTTPS_PROXY`. Set `ELECTRON_GET_USE_PROXY=true` (its own opt-in for `EnvHttpProxyAgent`) or `NODE_USE_ENV_PROXY=1`. Both need the proxy to be in the **environment**; npm's own `.npmrc` proxy is not read. If the proxy wants NTLM/Kerberos, no env var helps: download `electron-v<version>-win32-x64.zip` from the GitHub release in a browser and drop it into `%LOCALAPPDATA%\electron\Cache\<sha256 of the release URL>\`, then `npm start` unpacks it without touching the network. `npm run build` is unaffected — electron-builder passes its own proxy agent.
- **No bare `@` or `|` in a locale string.** vue-i18n reads `@` as its linked-message syntax and `|` as the plural separator, and a message that fails to compile **throws while rendering**. `"{count} Kanäle @ {rate} Hz"` did exactly that on the stream detail page for any stream carrying an rtp entry. `tests/locales.test.js` guards both characters along with key parity.
- The `overrides` in `package.json` are load-bearing, not cosmetic. `audify` pins `cmake-js@^7.3.1`, which pins `tar@^6.2.0`, for which the advisories have no upstream fix; tar is only used by `cmake-js/lib/downloader.js` to unpack the node headers at install time, and `^7.5.22` was verified against that exact `tar.extract()` call pattern. The `minimatch` and `glob` entries are scoped to the affected ranges so the many consumers of minimatch 3/5 and glob 7 are left alone. **Never run `npm audit fix --force`** here: it proposes downgrades, electron-builder 26 to 24 and ESLint 10 to 9.
