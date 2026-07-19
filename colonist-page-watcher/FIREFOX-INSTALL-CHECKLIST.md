# Firefox Install Checklist

Use this checklist for the permanent Firefox Release install path. Normal gameplay does not require Node, localhost, a command prompt, or the popup Scan button.

## Files To Use

- Unsigned XPI for Mozilla signing: `dist/colonist-page-watcher-0.1.8.xpi`
- Source package for Mozilla review: `dist/colonist-page-watcher-source-0.1.8.zip`
- Build identity and SHA-256 hashes: `dist/release-metadata.json`

## Before Submission

1. Run `powershell -ExecutionPolicy Bypass -File scripts\build-release.ps1` from `catanatron/colonist-page-watcher`.
2. Confirm the printed `dist/release-metadata.json` matches the XPI and source ZIP you submit.

The release script validates the extension, builds the unsigned XPI, builds the source ZIP, writes SHA-256 metadata, and verifies the metadata against the current artifacts.

## Mozilla Signing

1. Submit the unsigned XPI for Mozilla signing as an unlisted/self-distributed extension.
2. Attach or provide the source ZIP if Mozilla asks for source review material.
3. Use `AMO-SUBMISSION.md` for reviewer notes and `PRIVACY.md` for data handling notes.
4. Download the signed XPI returned by Mozilla.

## Permanent Firefox Verification

1. Install the Mozilla-signed XPI in Firefox Release.
2. Restart Firefox.
3. Open `about:addons` and confirm **Colonist Page Watcher** is still installed and enabled.
4. Open `https://colonist.io/` and start or join a game.
5. Confirm the dashboard opens automatically after WebSocket game activity starts.
6. Confirm the dashboard state strip shows `Version v0.1.8`, `Live`, and an automatic session reset.
7. Close or navigate away from all Colonist tabs and confirm the dashboard closes shortly after.

## Expected Normal Use

- Open Colonist.
- Start or join a game.
- Play normally.
- The dashboard opens and updates by itself every 0.5 seconds.
- No local server, native host, command prompt, Scan click, or manual reset is part of normal use.