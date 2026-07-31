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

Data stays in browser extension local storage through `chrome.storage.local`. Normal use does not send data to a remote server, localhost process, native host, analytics service, or third party.

The extension uses this locally processed data only to provide its visible game-tracking dashboard. It does not sell data, use it for advertising or credit decisions, transfer it to third parties, or allow the developer or other humans to read it. Its handling of user data complies with the Chrome Web Store User Data Policy, including the Limited Use requirements.

## User Control

Tracking is off on a fresh install. The popup explains what the extension reads and requires the user to choose **Enable tracking** before capture begins. The same control can disable capture. The popup also includes export/debug controls and a **New Game** reset flow. Removing the extension from Firefox or Chrome removes its extension-local stored data.

## Permissions

The extension requests access only to Colonist URLs plus `storage`, `unlimitedStorage`, `tabs`, and `activeTab` so it can retain complete long-game streams locally, keep tracker state, and open/close the packaged dashboard automatically.
