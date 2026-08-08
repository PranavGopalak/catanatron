# Catanatron Colonist Desktop

A dedicated macOS browser for `https://colonist.io/` with local game intelligence rendered directly into Colonist’s live interface.

## Current milestone

Version 0.3.0 provides:

* A persistent, dedicated Electron browser profile for Colonist
* A temporary, HTTPS-only Apple ID authentication path initiated exclusively by Colonist
* Strict navigation, popup, download, permission, renderer, and IPC boundaries
* Guaranteed resource cards inserted into each player’s real Colonist hand row
* Unresolved card backs that preserve the exact observed hand total without inventing identities
* An always visible left intelligence rail during games, with no dashboard tab switching
* Consent gated, local WebSocket card counting for an authorized experiment
* Exact hand totals for every player and exact resource composition for the local player
* Bounded resource ranges for opponents when individual card identities are hidden
* Victory point, hidden point risk, development card, event, trade, build, and uncertainty counts
* Development deck usage and exhausted card tracking
* Explicit possible and impossible resource states for each player
* Immediate settlement and city point build risk
* Automatic new-game detection plus a manual New Game reset
* A manual turn timer
* Two-dice probability reference
* Locally persisted notes
* Adjustable HUD opacity and a `Command + Shift + H` visibility shortcut
* A complete local test and packaging workflow

Counting is off by default. When the user explicitly enables the authorized experiment, the Electron main process captures binary WebSocket frames through Chromium's debugging protocol and decodes them with the existing `colonist-page-watcher/src/ws-core.js` implementation. The app never performs game actions.

Raw frames stay in volatile main-process memory for the current session. Only a normalized tracker snapshot reaches the isolated HUD. Frames and card state are cleared when counting is disabled, the user selects New Game, a new-game protocol event is decoded, the page performs a full navigation, or the app closes.

## Requirements

* macOS
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

Outside a live game, use the setup HUD to enable counting, manage the manual timer, view dice odds, and edit local notes. It can be dragged, collapsed, hidden, or restored with `Command + Shift + H`.

Inside a live game, the setup HUD automatically gets out of the way. Guaranteed known cards and unresolved card backs appear in Colonist’s existing player hand rows. The left intelligence rail remains visible with resource ranges, resources a player cannot have, development card usage, point build risk, trade risk, and recent deductions. If counting is off, the rail offers a direct Enable counting control.

Select New Game to clear the current ledger manually. The settings tab can disable and clear capture, change panel opacity, center the panel, or reset all locally saved HUD data.

## Validation

```bash
npm run check
```

This builds the isolated main and preload bundles, runs unit, capture, decoding, state, and security tests, and verifies that capture remains in the browser process rather than injecting the extension's page-context WebSocket hook.

## Package the Mac app

```bash
npm run package:mac
```

The unpacked application is written to `release/`. Packaging enables Electron's restrictive production fuses and applies an ad hoc local signature. It is suitable for local testing. Public distribution additionally requires an Apple Developer signing identity, hardened runtime configuration, and notarization.

## Security model

Colonist is remote and therefore untrusted content from Electron's point of view. The game renderer has Node integration disabled, context isolation and Chromium sandboxing enabled, normal web security preserved, and no general Electron API bridge. The isolated preload owns the setup HUD and immersive annotations, and exposes no API to the page.

Normal navigation is limited to HTTPS URLs on `colonist.io` and its subdomains. When Colonist starts `/auth/apple` or `/auth-link/apple`, the browser temporarily permits same-window navigation to the exact `appleid.apple.com` host for up to five minutes. The exception closes when navigation returns to Colonist. Other external navigation, popups, downloads, embedded webviews, and browser permission requests are denied. HUD and tracker IPC validate the sender, accept only narrow schemas, and sanitize every persisted value.

The WebSocket listener uses Electron's main-process debugger API and sends no API bridge into the remote renderer. Binary frames are bounded in size, text frames are ignored, retained history is capped at 20,000 frames, analysis is throttled, and raw payloads are never sent to the HUD or written to disk.

## Experimental authorization boundary

This integration is intended only for the explicitly authorized experiment represented by the user. Keep counting disabled anywhere that authorization does not apply. The implementation preserves hidden information honestly: opponent hand totals are exact when present in the server state, but hidden resource identities display as feasible ranges rather than fabricated exact values.

## Authentication note

Email, password, and Sign in with Apple can use the persistent app profile. Apple authentication is allowed only when Colonist initiates it, only over HTTPS, and only on `appleid.apple.com`. Other identity providers remain blocked until they receive an equally narrow authentication policy.
