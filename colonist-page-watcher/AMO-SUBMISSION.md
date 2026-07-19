# AMO Self-Distribution Notes

Use this when submitting the unsigned XPI for Mozilla signing as an unlisted/self-distributed extension.

## Built Package

`dist/colonist-page-watcher-0.1.8.xpi`

## Suggested Summary

Automatic local Colonist card tracker dashboard. Opens when a Colonist game starts, tracks game events from local WebSocket data, and stays on-device.

## Suggested Reviewer Notes

This extension runs only on `colonist.io` and subdomains. It injects a page-context WebSocket hook at `document_start` to copy Colonist game frames into extension storage, then decodes them locally in the packaged dashboard at `dashboard/index.html`. The `unlimitedStorage` permission prevents long local games from losing their opening frames; no captured data leaves Firefox. It does not require localhost, native messaging, external services, analytics, or remote code. The dashboard opens automatically after WebSocket game activity starts and closes after Colonist tabs are closed or navigated away.

## Install Checklist

See FIREFOX-INSTALL-CHECKLIST.md for the signing, install, restart, and live-game verification checklist.

## Validation Run Before Submission

`node scripts/validate-all.cjs`

## Privacy

See `PRIVACY.md`.
