# Privacy Notes for Colonist Page Watcher

Colonist Page Watcher is designed for local, personal game tracking.

## Data Collected

The extension reads Colonist game page activity and WebSocket frames from pages matching `https://colonist.io/*` and `https://*.colonist.io/*`. It stores local game evidence needed for the tracker:

- visible game-like text rows,
- captured Colonist WebSocket frames,
- parsed game events,
- resource-card mapping preferences,
- latest local hand snapshot and dashboard state.

## Where Data Goes

Data stays in Firefox extension local storage through `chrome.storage.local`. Normal use does not send data to a remote server, localhost process, native host, analytics service, or third party.

## User Control

The popup includes export/debug controls and a **New Game** reset flow. Removing the extension from Firefox removes its extension-local stored data.

## Permissions

The extension requests access only to Colonist URLs plus `storage`, `unlimitedStorage`, `tabs`, and `activeTab` so it can retain complete long-game streams locally, keep tracker state, and open/close the packaged dashboard automatically.
