# Colonist Page Watcher

Firefox/Chrome extension for watching Colonist game WebSocket updates and showing a clean local card tracker dashboard.

## Normal Firefox use

Normal tracking is extension-only. You do not run Node, localhost, a native host, or a command prompt while playing.

1. Install the signed Firefox XPI once.
2. Open `https://colonist.io/` and start or join a game.
3. The extension starts a fresh tracking session automatically when the game-start WebSocket event appears, then opens the dashboard after real game activity starts.
4. Play normally. The dashboard updates every 0.5 seconds from extension storage.
5. When all Colonist tabs are closed or navigated away, the dashboard closes itself after a short delay.

Firefox Release only keeps signed add-ons across browser restarts. Use Mozilla **unlisted** signing for a private/personal install, then install the signed XPI in Firefox. See `FIREFOX-INSTALL-CHECKLIST.md` for the signing and restart-verification checklist.

## Temporary Firefox testing

Use this only while developing or before the XPI is signed:

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select `catanatron/colonist-page-watcher/manifest.json`.
4. Refresh any already-open Colonist tab.
5. Start or join a game. The dashboard opens automatically after game WebSocket activity starts.

Temporary add-ons are removed when Firefox closes. That is a Firefox limitation, not a tracker setting.

## Chrome development testing

Chrome is supported for quick local testing only:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose `catanatron/colonist-page-watcher`.
5. Refresh any already-open Colonist tab.

## Capture workflow

The extension is raw-first:

1. Capture broad visible text evidence into `colonistAllRawLogs`.
2. Keep clean game-like tracker rows in `colonistRawLogs`.
3. Attach a best-effort parsed classification to each tracker row.
4. Show tracker rows by default, with an **All captured text** filter for debugging.
5. Capture WebSocket open/send/receive/close/error frames into `colonistWebSocketFrames`.
6. Export DOM streams, WebSocket frames, parsed events, and tracker state with **Export JSON** to `Downloads/colonist-watcher/latest.json`.

This keeps the original evidence even when filters or parser guesses are wrong. The tracker is built from the clean stream, while the archive is used to recover missing patterns.

## What it watches

The content script uses a page-context WebSocket hook at `document_start` plus `MutationObserver` visible page text capture. WebSocket frames stay local in extension storage and are exported for protocol analysis; DOM capture remains as backup evidence.

## Storage

- Broad captured text is stored in `chrome.storage.local` under `colonistAllRawLogs`.
- Tracker raw logs are stored in `chrome.storage.local` under `colonistRawLogs`.
- WebSocket frames are stored in `chrome.storage.local` under `colonistWebSocketFrames`.
- Parsed events are stored in `chrome.storage.local` under `colonistEvents`.
- The extension keeps the latest 5,000 archive rows, 20,000 WebSocket frames, 2,000 tracker rows, and 500 parsed DOM events. The dashboard rebuilds authoritative game state from the retained WebSocket stream.
- A new game is reset automatically from the decoded WebSocket `game_start` event. Use the popup **Reset Game** button only as a manual fallback while testing.

## Development notes

If an archived row is useful but missing from tracker rows, adjust capture filtering in `src/content.js`. If a tracker row is useful but parsed as `unknown`, update `classifyLine` in `src/core.js` after inspecting real exported logs.
## Offline analysis

After exporting JSON from the popup, analyze it from this folder:

```powershell
node scripts\validate-all.cjs
node scripts\analyze-logs.cjs path\to\colonist-raw-logs.json
```

The analyzer reparses raw logs, reports unknown patterns, summarizes event coverage, and rebuilds tracker state. Use it to decide which Colonist log patterns need parser updates.

A small smoke-test sample is included:

```powershell
node scripts\analyze-logs.cjs scripts\sample-export.json
```
## Live game test flow

1. In Firefox, go to `about:debugging#/runtime/this-firefox` and reload **Colonist Page Watcher**. In Chrome, use `chrome://extensions`.
2. Refresh the Colonist game tab after reloading the add-on.
3. Start or join a game.
4. The extension dashboard should open automatically as a background tab once game/WebSocket activity starts.
5. Watch the dashboard update every 0.5 seconds. It should show players, resource estimates, recent events, your latest hand, and trade danger warnings when applicable.
6. Use the popup only for debugging/exporting/reset fallback; normal tracking does not require clicking **Scan**, clicking reset, or running a local server.

## Validation commands

Normal gameplay never uses these commands. They are only for developing or packaging the extension.

From this folder, run the complete local validation suite:

```powershell
node scripts\validate-all.cjs
```

For a release/signing package, use the one-command release builder instead:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-release.ps1
```

That command validates the extension, proves background auto-open behavior, builds the unsigned XPI and source ZIP, writes SHA-256 metadata, and verifies the metadata.

## Pattern candidates

The analyzer groups unknown lines under **Pattern candidates from unknown lines**. Those grouped examples are the fastest way to teach the tracker Colonist-specific wording. After a real game export, prioritize patterns with the highest counts first.
You can also save **Copy Raw** output as a `.txt` file and analyze it directly:

```powershell
node scripts\analyze-logs.cjs scripts\sample-copy-raw.txt
```

## WebSocket tracker

See `PROTOCOL.md` for the verified WebSocket signals used by the tracker.

The shared `src/ws-core.js` decoder uses the verified resource mapping (`1=lumber`, `2=brick`, `3=wool`, `4=grain`, `5=ore`). It merges authoritative hand totals, victory-point components, development-card counts, initial-placement distributions, and the game log. Your own hand composition is exact; opponent resource values are conservative guaranteed minimums plus an explicit unknown-card count. The popup is intentionally limited to launching the dashboard, setting your player name, resetting a session, and exporting diagnostics.

## Extension dashboard

The main dashboard is packaged inside the extension at `dashboard/index.html`. Normal use does not require localhost, Node, native messaging, or a command prompt.

When a Colonist game starts sending WebSocket activity, `src/content.js` detects the decoded `game_start` event and clears previous-game logs automatically; then `src/background.js` opens the dashboard extension page. The dashboard reads `chrome.storage.local` every 0.5 seconds, decodes WebSocket frames with `src/ws-core.js`, color-codes resources, shows player card estimates, flags stale streams, and warns when recent trades create visible or hidden-VP win risk.


## Permanent Firefox install

Firefox Release removes temporary add-ons after restart. For a permanent install, build an XPI and submit it to Mozilla for signing. Use **unlisted** distribution if this is just for personal/private use.

Build the package:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-release.ps1
```

The script validates the extension, builds the unsigned XPI, builds the AMO source ZIP, writes SHA-256 metadata, and verifies the metadata. The unsigned package is written to:

```text
dist\colonist-page-watcher-0.1.8.xpi
```

The resulting `dist\release-metadata.json` records file sizes and SHA-256 hashes for the XPI and AMO source ZIP so you can verify which build was submitted or installed.

Submit that XPI at Mozilla Add-ons Developer Hub for signing. After Mozilla signs it, install the signed XPI in Firefox and it will persist across browser restarts. No localhost dashboard server or native host is needed for normal use. See `AMO-SUBMISSION.md` and `PRIVACY.md` for copy-ready signing notes.

