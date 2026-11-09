# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

AES67 Stream Monitor — an Electron + Vue 3 desktop app that discovers AES67/RAVENNA/ST 2110-30 audio-over-IP streams via SAP and plays selected channels through a local audio device (via `audify`/RtAudio). The README is partly in German.

## Commands

```bash
npm install                  # installs audify native module (prebuilds for most platforms)
npm run serve                # renderer dev server on port 8888 (must run before `npm start`)
npm start                    # launch Electron against localhost:8888
npm run lint                 # eslint via vue-cli-service
npm run format               # prettier --write . (tabs, tabWidth 2)
npm run build                # vue-cli-service build && electron-builder --win --x64
npm run build-electron-only  # repackage without rebuilding the renderer
```

Development needs **two** terminals: `npm run serve` and `npm start`. `main.js` loads `http://localhost:8888` when not packaged and `./dist/index.html` when packaged.

There is no test suite and no test runner configured. Verification is manual against real AES67 hardware or GStreamer-generated streams (see README for the tested matrix and [philhartung/aoip-tester](https://github.com/philhartung/aoip-tester)).

Builds and the CI release workflow (`.github/workflows/build.yml`, triggered by `v*` tags) are **Windows x64 only**, even though the runtime code handles macOS/Linux.

## Architecture: four processes

1. **Electron main** (`main.js` + `backend/`) — windowing, config persistence, device enumeration, IPC router.
2. **Renderer** (`src/`) — Vue 3 app, no router and no Vuex/Pinia.
3. **`src/lib/sdp.js`** — forked child process. SAP discovery on UDP 9875 / `239.255.255.255`.
4. **`src/lib/audio.js`** — forked child process. RTP receive + RtAudio playback.

The two child processes are isolated with `child_process.fork` deliberately (stability of the main process) and have **no Electron access**. They talk only over `process.send` / `process.on("message")` and `process.exit` on `disconnect`.

### Message flow

Renderer → main: `window.electronAPI.sendMessage(msg)` (`preload.js`) → `ipcMain.on("recv-message")` → `backend/ipc/ipcHandler.js` `handleIpcMessage` switch → forwarded to `sdpProcess` / `audioProcess`.

Main → renderer: `sendMessage(type, data)` in `main.js` → `"send-message"` channel → switch in `initIpcReceiver` (`src/store/ipc.js`).

Initial config snapshot is a separate `invoke` channel: `get-shared-config`.

**Adding a message means touching up to three switch statements**: `backend/ipc/ipcHandler.js` (main side), `src/store/ipc.js` (renderer side), and the `process.on("message")` switch in the relevant `src/lib/*.js` child.

### `src/lib/` is not bundled

`src/lib/sdp.js` and `src/lib/audio.js` are forked by path at runtime and shipped verbatim (`files:` list in `electron-builder.yml`). They must stay plain CommonJS Node — no webpack, no ESM, no `@/` aliases. New runtime files under `src/lib/` need no build change, but new top-level directories do need an `electron-builder.yml` entry.

## Configuration: two separate stores

| | file | scope |
|---|---|---|
| `persistentData` | Windows `%ProgramData%\StreamMonitor\config.json`, else `/etc/StreamMonitor/config.json` | machine-wide (settings, network, favorites, `passwordHash`) |
| `userData` | `<appData>/StreamMonitor/user.json` | per-user UI state (window bounds, sidebar, favorites order) |

Paths and the early `app.setPath("userData", ...)` override live in `backend/config/paths.js`; writes are atomic (tmp + rename) and debounced in `backend/persistence/persistence.js`.

Defaults are **duplicated** in `backend/config/defaults.js` (main) and `src/store/state.js` (renderer) — change both. Merging on load (`persistence.js` `loadData`) and on save (`ipcHandler.js` `savePersistent`/`saveUser`) enumerates keys explicitly (`settings`, `network`, `devices`, `favorites`), so a new top-level key in `persistentData` must be added to those merge blocks or it will be dropped. `adminMode` is an example of a key that exists at runtime but not in `defaults.js` — it is initialized defensively in `SideBar.vue`.

### Saving from the renderer

`src/store/config.js` installs deep watchers on `persistentData` and `userData`: mutating them anywhere auto-saves after 300ms. `isApplyingFromMain()` suppresses that while a `updatePersistentData` push from main is being applied — keep that guard in mind when adding new main→renderer state pushes, or you get a save ping-pong.

## Renderer state

`src/store/state.js` holds plain `ref`s; `src/store/actions.js` holds the logic. Both are re-exported through `src/app.js`, and **components import everything from `../app.js`** (not from the store files directly). `src/app.js` also kicks off `loadSharedConfig()` → `setupConfigWatchers()` → `initIpcReceiver()`.

Navigation is the `page` ref plus a `<component :is>` switch in `App.vue`. Adding a page = new file in `src/components/pages/` + a case in that switch + a sidebar entry.

Admin mode gates settings/favorites editing. The password is SHA-256-hashed with Web Crypto and compared **in the renderer** (`SideBar.vue` checks, `SettingsPage.vue` sets; empty input clears). It is a UI lock for kiosk-style deployments, not a security boundary — the hash sits in the same JSON the app reads.

## Audio path notes (`src/lib/audio.js`)

- Output is always a 2-channel SINT16 stream; `ch1Map`/`ch2Map` pick which source channels to take. L24 input is read as its upper 16 bits (3-byte samples, `readUInt16BE` at the sample offset).
- Packets are written into a 1024-slot ring indexed by RTP sequence number; `jitterBufferSize` (user setting) is the read lag in packets.
- `outSampleFactor` is raised until at least 48 samples are written per RtAudio call, and forces the jitter buffer to at least that size — short `ptime` streams (0.125 ms) depend on this.
- RTP header length accounts for CSRC count and the extension header; packets whose length doesn't match the expected `pcmDataSize + headerLength` are dropped, as are packets failing the SDP `source-filter`.
- Device selection matches on **name + inputChannels + outputChannels**, never on `id` (RtAudio ids are not stable). RtAudio is instantiated twice: `backend/system/audio.js` for enumeration in main, `src/lib/audio.js` for playback in the child.
- Device changes trigger `restartStream()` in `main.js`, which stops playback and sends `refreshAfterDeviceChange` so the renderer re-plays the current stream.

## SAP/SDP notes (`src/lib/sdp.js`)

- Sessions are keyed by MD5 of the SDP `origin`. SAP header bit `0x4` means session deletion.
- Manually added streams (`manual: true`) are never overwritten by SAP announcements and never expire; discovered ones expire after `sdpDeleteTimeout` seconds.
- Streams added with `announce: true` are re-broadcast by this app every 30 s with a random SAP message id (required by Dante Controller) and announced as deleted on removal.
- Support gating lives in `isSupportedStream`: audio/`RTP/AVP` only, exactly one rtpmap, L16/L24, 1–64 channels, sample rate in `supportedSampleRates`. Unsupported streams are still listed with an `unsupportedReason` unless `hideUnsupported` is set.
- `main.js` hashes the concatenated raw SDP of manual streams to decide when to persist, and lazily sends `init` to the SDP child on the first 2-second `updateSystem` tick that has a network interface.
