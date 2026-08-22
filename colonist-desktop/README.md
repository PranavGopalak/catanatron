# Catanatron Colonist Desktop

A dedicated macOS and Windows browser for `https://colonist.io/` with local game intelligence in a permanent, app-owned browser sidebar.

## Current milestone

Version 0.8.0 provides:

* A persistent, dedicated Electron browser profile for Colonist
* Native macOS and 64-bit Windows application packages with hardened Electron fuses
* A temporary, HTTPS-only Apple ID authentication path initiated exclusively by Colonist
* Strict navigation, popup, download, permission, renderer, and IPC boundaries
* A permanent 372 pixel browser sidebar owned by the desktop app, not injected into Colonist
* Large, readable resource ranges and feasible-hand percentages prioritized for immediate scanning
* A compact 58 pixel collapsed rail that returns almost the entire window to Colonist
* Native player hands, the complete right sidebar, chat, settings, board, hand, and action controls preserved
* Player labels taken directly from Colonist’s native rows, with tracker data bound by player color and fail-closed pending states for unmatched identities
* A separate secured Colonist page surface that resizes beside the app sidebar without changing the game DOM
* Automatic compact mode for narrow windows
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
* Instant sidebar collapse with `Command + Shift + H` on macOS and `Ctrl + Shift + H` on Windows
* A complete local test and packaging workflow

Counting is off by default. When the user explicitly enables the authorized experiment, the Electron main process captures binary WebSocket frames through Chromium's debugging protocol and decodes them with the existing `colonist-page-watcher/src/ws-core.js` implementation. The app never performs game actions.

Raw frames stay in volatile main-process memory for the current session. Only a normalized tracker snapshot reaches the isolated app sidebar. Frames and card state are cleared when counting is disabled, the user selects New Game, a new-game protocol event is decoded, the page performs a full navigation, or the app closes.

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

The left sidebar is part of the Electron application itself. Colonist loads in its own sandboxed page surface to the right, so native player rows, chat, settings, the board, the right sidebar, the hand, and action controls remain untouched. Catanatron reads a bounded native identity snapshot only to bind decoded tracker records to the names and colors currently shown by Colonist.

Use the sidebar to enable counting, inspect card knowledge, manage the manual timer, view dice odds, and edit local notes. Select New Game to clear the current ledger manually. The Setup tab can disable and clear capture or reset all locally saved Catanatron data.

The sidebar is 372 pixels wide on normal desktop windows. Collapse it to a 58 pixel browser rail with its chevron or `Command + Shift + H` on macOS and `Ctrl + Shift + H` on Windows. Windows below 1080 pixels wide use compact mode automatically so the native game keeps useful space.

## Validation

```bash
npm run check
```

This builds the isolated main and preload bundles, runs unit, capture, decoding, state, and security tests, and verifies that capture remains in the browser process rather than injecting the extension's page-context WebSocket hook.

## Package the Mac app

```bash
npm run package:mac
npm run archive:mac
npm run package:mac:dmg
```

The unpacked application is written to `release/`. The DMG command creates the native Mac distribution image with the app and an Applications shortcut, verifies the disk image, and writes a matching SHA-256 checksum. Pass `--out=/path` to the packaging script when a separate release directory is needed. Packaging enables Electron's restrictive production fuses and applies an ad hoc local signature. It is suitable for experimental distribution. A warning-free public Mac release additionally requires an Apple Developer signing identity, hardened runtime configuration, and notarization.

## Package the Windows app

```bash
npm run package:win
npm run package:win:installer
```

The installer command creates a one-click, per-user Windows setup executable in `release/installer/`. Opening it installs Catanatron Colonist, creates desktop and Start Menu shortcuts, and launches the app without requesting administrator access. The packaged application includes native executable metadata, a multi-resolution Windows icon, asar integrity, restrictive Electron fuses, and an `asInvoker` manifest.

For Windows on ARM:

```bash
npm run package:win:arm64
```

The package can be structurally verified on any host with `npm run verify:win`. On Windows, `npm run smoke:win:installer` silently installs the real setup executable, verifies both shortcuts and the uninstall entry, launches the installed app in an isolated profile, validates its version metadata, and uninstalls it again.

These Windows installers are intentionally unsigned. They work as per-user applications, but Windows may show a SmartScreen warning until a trusted Authenticode certificate is configured. Public distribution should sign and timestamp the installer after the fuse and asar steps.

## Security model

Colonist is remote and therefore untrusted content from Electron's point of view. The game renderer has Node integration disabled, context isolation and Chromium sandboxing enabled, normal web security preserved, and no general Electron API bridge. A local file renderer owns the application sidebar, while Colonist runs in a separate `WebContentsView`. The shared preload exposes no API to the remote page and never inserts Catanatron interface elements into its DOM.

Normal navigation is limited to HTTPS URLs on `colonist.io` and its subdomains. When Colonist starts `/auth/apple` or `/auth-link/apple`, the browser temporarily permits same-window navigation to the exact `appleid.apple.com` host for up to five minutes. The exception closes when navigation returns to Colonist. Other external navigation, popups, downloads, embedded webviews, and browser permission requests are denied. Sidebar and tracker IPC validate whether the sender is the local shell or remote game surface, accept only narrow schemas, and sanitize every persisted value.

The WebSocket listener uses Electron's main-process debugger API and sends no API bridge into the remote renderer. Binary frames are bounded in size, text frames are ignored, retained history is capped at 20,000 frames, analysis is throttled, and raw payloads are never sent to the sidebar or written to disk.

## Experimental authorization boundary

This integration is intended only for the explicitly authorized experiment represented by the user. Keep counting disabled anywhere that authorization does not apply. The implementation preserves hidden information honestly: opponent hand totals are exact when present in the server state, but hidden resource identities display as feasible ranges rather than fabricated exact values. Percentages describe the share of feasible hand compositions containing a resource, not a claim about the opponent’s behavior or an unsupported predictive probability. A missing hand snapshot remains unknown rather than being misreported as an empty hand.

## Authentication note

Email, password, and Sign in with Apple can use the persistent app profile. Apple authentication is allowed only when Colonist initiates it, only over HTTPS, and only on `appleid.apple.com`. Other identity providers remain blocked until they receive an equally narrow authentication policy.
