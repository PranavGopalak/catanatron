# Catanatron Colonist Desktop

A dedicated macOS browser for `https://colonist.io/` with a local Catan utility HUD rendered over the game.

## Current milestone

Version 0.1 provides:

* A persistent, single-site Electron browser profile for Colonist
* Strict navigation, popup, download, permission, renderer, and IPC boundaries
* A movable and collapsible in-game HUD
* A manual turn timer
* Two-dice probability reference
* Locally persisted notes
* Adjustable HUD opacity and a `Command + Shift + H` visibility shortcut
* A complete local test and packaging workflow

The desktop app does not read Colonist page content, intercept WebSocket traffic, call internal APIs, or automate game actions. Those integrations require a separate authorization decision before they can be added.

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

## Controls

Drag the HUD by its title bar. Use the minus button to collapse it and the close button to hide it. Press `Command + Shift + H` to show or hide the HUD at any time.

The settings tab can change panel opacity, center the panel, or reset all locally saved HUD data.

## Validation

```bash
npm run check
```

This builds the isolated preload bundle, runs unit and security tests, and verifies that the desktop bundle does not contain the existing WebSocket capture hook.

## Package the Mac app

```bash
npm run package:mac
```

The unpacked application is written to `release/`. Packaging enables Electron's restrictive production fuses and applies an ad hoc local signature. It is suitable for local testing. Public distribution additionally requires an Apple Developer signing identity, hardened runtime configuration, and notarization.

## Security model

Colonist is remote and therefore untrusted content from Electron's point of view. The game renderer has Node integration disabled, context isolation and Chromium sandboxing enabled, normal web security preserved, and no general Electron API bridge. The isolated preload owns the HUD and exposes no API to the page.

Navigation is limited to HTTPS URLs on `colonist.io` and its subdomains. Popups, downloads, embedded webviews, and browser permission requests are denied. HUD state IPC validates the sender and sanitizes all persisted values before writing a small local JSON file.

## Authentication note

Email and password login on Colonist can use the persistent app profile. Some third-party identity providers reject embedded browsers by policy. The initial implementation intentionally does not weaken navigation controls to work around that restriction.
