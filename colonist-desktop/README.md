# Catanatron Colonist Desktop

A dedicated macOS browser for `https://colonist.io/` with a local Catan utility HUD rendered over the game.

## Current milestone

Version 0.2 provides:

* A persistent, single-site Electron browser profile for Colonist
* Strict navigation, popup, download, permission, renderer, and IPC boundaries
* A movable and collapsible in-game HUD
* Consent-gated, local WebSocket card counting for an authorized experiment
* Exact hand totals for every player and exact resource composition for the local player
* Bounded resource ranges for opponents when individual card identities are hidden
* Victory point, hidden point risk, development card, event, trade, build, and uncertainty counts
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

Drag the HUD by its title bar. Use the minus button to collapse it and the close button to hide it. Press `Command + Shift + H` to show or hide the HUD at any time.

Open the Cards tab and select Enable counting before joining or starting a game. The optional Colonist player name improves local-player matching when the protocol roster is incomplete. The Cards tab shows exact hand totals, honest resource ranges, points, development cards, recent events, decoded-frame health, and uncertainty.

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

Colonist is remote and therefore untrusted content from Electron's point of view. The game renderer has Node integration disabled, context isolation and Chromium sandboxing enabled, normal web security preserved, and no general Electron API bridge. The isolated preload owns the HUD and exposes no API to the page.

Navigation is limited to HTTPS URLs on `colonist.io` and its subdomains. Popups, downloads, embedded webviews, and browser permission requests are denied. HUD and tracker IPC validate the sender, accept only narrow schemas, and sanitize every persisted value.

The WebSocket listener uses Electron's main-process debugger API and sends no API bridge into the remote renderer. Binary frames are bounded in size, text frames are ignored, retained history is capped at 20,000 frames, analysis is throttled, and raw payloads are never sent to the HUD or written to disk.

## Experimental authorization boundary

This integration is intended only for the explicitly authorized experiment represented by the user. Keep counting disabled anywhere that authorization does not apply. The implementation preserves hidden information honestly: opponent hand totals are exact when present in the server state, but hidden resource identities display as feasible ranges rather than fabricated exact values.

## Authentication note

Email and password login on Colonist can use the persistent app profile. Some third-party identity providers reject embedded browsers by policy. The initial implementation intentionally does not weaken navigation controls to work around that restriction.
