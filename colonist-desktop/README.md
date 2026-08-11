# Catanatron Colonist Desktop

A dedicated macOS and Windows browser for `https://colonist.io/` with local game intelligence rendered directly into Colonist’s live interface.

## Current milestone

Version 0.7.0 provides:

* A persistent, dedicated Electron browser profile for Colonist
* Native macOS and 64-bit Windows application packages with hardened Electron fuses
* A temporary, HTTPS-only Apple ID authentication path initiated exclusively by Colonist
* Strict navigation, popup, download, permission, renderer, and IPC boundaries
* A dedicated left intelligence column with no mutations inside Colonist’s native player rows
* Large, flat resource ranges prioritized at the top for immediate scanning
* A readable multiplayer intelligence column that occupies 27 percent of the rendered page and scales with the window
* Native player hands, the complete right sidebar, chat, settings, board, hand, and action controls preserved
* Player labels taken directly from Colonist’s native rows, with tracker data bound by player color and fail-closed pending states for unmatched identities
* Side advertisement gutters reclaimed while the native game reflows beside the column
* A compact in-game intelligence button for Beginner Mode and narrow windows
* Consent gated, local WebSocket card counting for an authorized experiment
* Exact hand totals for every player and exact resource composition for the local player
* Bounded resource ranges for opponents when individual card identities are hidden
* Feasible-hand percentages showing how often each resource appears across every mathematically valid composition
* An exact dynamic resource range solver cross checked against brute force reference states
* Victory point, hidden point risk, development card, event, trade, build, and uncertainty counts
* Development deck usage and exhausted card tracking
* Explicit possible, impossible, guaranteed, and not-yet-observed resource states for each player
* Honest widening and a visible conflict marker when protocol evidence is infeasible
* Immediate settlement and city resource affordability risk
* Automatic new-game detection plus a manual New Game reset
* A manual turn timer
* Two-dice probability reference
* Locally persisted notes
* Adjustable HUD opacity with `Command + Shift + H` on macOS and `Ctrl + Shift + H` on Windows
* A complete local test and packaging workflow

Counting is off by default. When the user explicitly enables the authorized experiment, the Electron main process captures binary WebSocket frames through Chromium's debugging protocol and decodes them with the existing `colonist-page-watcher/src/ws-core.js` implementation. The app never performs game actions.

Raw frames stay in volatile main-process memory for the current session. Only a normalized tracker snapshot reaches the isolated HUD. Frames and card state are cleared when counting is disabled, the user selects New Game, a new-game protocol event is decoded, the page performs a full navigation, or the app closes.

## Requirements

* macOS, or 64-bit Windows 10 or Windows 11
* Node.js 22 or later
* npm

## Run locally

```bash
cd colonist-desktop
npm install
npm start
```

The app keeps its own persistent Chromium profile, so the user signs into Colonist once inside the desktop app. No Colonist credentials are stored by Catanatron.

For a rendered counter demonstration using sanitized fixture data:

```bash
npm run start:demo
```

## Controls

Outside a live game, use the setup HUD to enable counting, manage the manual timer, view dice odds, and edit local notes. It can be dragged, collapsed, hidden, or restored with `Command + Shift + H` on macOS or `Ctrl + Shift + H` on Windows.

Inside a live game, the setup HUD automatically gets out of the way. Catanatron renders all resource knowledge and derived game-state analytics in its own left column. It reads native player rows only to mirror their seating order and never inserts elements into them, hides their cards, or changes the right sidebar.

Multiplayer games use a cream and blue intelligence column on the left. It occupies 27 percent of the rendered page, with a 320 CSS pixel minimum, and reclaims the side advertisement gutters while Colonist’s board and complete native right sidebar reflow into the remaining space. The layout requires more than 880 CSS pixels for the native game and automatically returns to compact mode when that guarantee cannot be met. Resource ranges appear first, followed only by actionable watch items and compact development card tracking.

Beginner Mode and narrow windows use a small C button beside the native settings control because tutorial objectives occupy Colonist’s left edge. The button opens the same intelligence on demand without permanently covering the tutorial. Resource ranges, development card usage, resource affordability risk, and actionable trade risk remain available in both modes. If counting is off, the intelligence surface offers a direct Enable counting control.

Select New Game to clear the current ledger manually. The settings tab can disable and clear capture, change panel opacity, center the panel, or reset all locally saved HUD data.

## Validation

```bash
npm run check
```

This builds the isolated main and preload bundles, runs unit, capture, decoding, state, and security tests, and verifies that capture remains in the browser process rather than injecting the extension's page-context WebSocket hook.

## Package the Mac app

```bash
npm run package:mac
npm run archive:mac
```

The unpacked application is written to `release/`. The archive command creates a ZIP that preserves the macOS application bundle and writes a matching SHA-256 checksum. Pass `--out=/path` to the packaging script when a separate release directory is needed. Packaging enables Electron's restrictive production fuses and applies an ad hoc local signature. It is suitable for local testing. Public distribution additionally requires an Apple Developer signing identity, hardened runtime configuration, and notarization.

## Package the Windows app

```bash
npm run package:win
```

The portable 64-bit application is written to `release/Catanatron Colonist-win32-x64/`, with a transferable ZIP and SHA-256 checksum beside it. Extract the ZIP and open `Catanatron Colonist.exe` on Windows. The build includes native executable metadata, a multi-resolution Windows icon, asar integrity, restrictive Electron fuses, and an `asInvoker` manifest so it never requests administrator access.

For Windows on ARM:

```bash
npm run package:win:arm64
```

The package can be structurally verified on any host with `npm run verify:win`. On Windows, `npm run smoke:win` launches the real packaged executable in an isolated temporary profile, waits for a usable native window, validates its version metadata, writes `windows-smoke.json`, and closes the test process.

These local Windows packages are intentionally unsigned. They work as portable applications, but Windows may show a SmartScreen warning until a trusted Authenticode certificate is configured. Public distribution should sign and timestamp the executable after the fuse and asar steps.

## Security model

Colonist is remote and therefore untrusted content from Electron's point of view. The game renderer has Node integration disabled, context isolation and Chromium sandboxing enabled, normal web security preserved, and no general Electron API bridge. The isolated preload owns the setup HUD and immersive annotations, and exposes no API to the page.

Normal navigation is limited to HTTPS URLs on `colonist.io` and its subdomains. When Colonist starts `/auth/apple` or `/auth-link/apple`, the browser temporarily permits same-window navigation to the exact `appleid.apple.com` host for up to five minutes. The exception closes when navigation returns to Colonist. Other external navigation, popups, downloads, embedded webviews, and browser permission requests are denied. HUD and tracker IPC validate the sender, accept only narrow schemas, and sanitize every persisted value.

The WebSocket listener uses Electron's main-process debugger API and sends no API bridge into the remote renderer. Binary frames are bounded in size, text frames are ignored, retained history is capped at 20,000 frames, analysis is throttled, and raw payloads are never sent to the HUD or written to disk.

## Experimental authorization boundary

This integration is intended only for the explicitly authorized experiment represented by the user. Keep counting disabled anywhere that authorization does not apply. The implementation preserves hidden information honestly: opponent hand totals are exact when present in the server state, but hidden resource identities display as feasible ranges rather than fabricated exact values. Percentages describe the share of feasible hand compositions containing a resource, not a claim about the opponent’s behavior or an unsupported predictive probability. A missing hand snapshot remains unknown rather than being misreported as an empty hand.

## Authentication note

Email, password, and Sign in with Apple can use the persistent app profile. Apple authentication is allowed only when Colonist initiates it, only over HTTPS, and only on `appleid.apple.com`. Other identity providers remain blocked until they receive an equally narrow authentication policy.
