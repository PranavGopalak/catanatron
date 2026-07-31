# Chrome Web Store Submission

## Package

Upload `dist/colonist-page-watcher-chrome-0.1.9.zip`.

## Store listing

**Name:** Colonist Page Watcher

**Summary:** Track Colonist game events, cards, and win risks in a private dashboard that stays in your browser.

**Category:** Productivity

**Language:** English

**Graphic assets:**

- Store icon: `assets/icon-128.png`
- Screenshot: `store-assets/chrome/dashboard-1280x800.jpg`
- Small promo tile: `store-assets/chrome/promo-440x280.jpg`

**Detailed description:**

Colonist Page Watcher turns live Colonist game activity into a focused card-tracking dashboard. Enable tracking from the extension popup, open or join a game on colonist.io, and the dashboard updates automatically from the game's visible activity and WebSocket stream.

- Track player card estimates and your exact visible hand.
- Follow dice rolls, trades, builds, steals, discards, and development cards.
- See build readiness, hidden victory-point risk, and development-deck status.
- Reset automatically when a new game starts.
- Export local diagnostics when you want to inspect or improve parsing.
- Keep captured game data in Chrome extension storage with no analytics or remote service.

This extension is an independent companion and is not affiliated with or endorsed by Colonist.io.

## Single purpose

Provide a local, user-controlled dashboard that interprets game activity from colonist.io so the player can follow the current game's card state and risks.

## Permission justifications

- `storage`: Saves consent, locally captured game evidence, parsed tracker state, and user preferences in the browser.
- `unlimitedStorage`: Retains the complete WebSocket evidence needed to reconstruct long games without silently losing early setup state.
- Host access for `https://colonist.io/*` and `https://*.colonist.io/*`: Runs the tracker only on Colonist pages and reads only the game activity required for the user-facing dashboard.

## Privacy practices

The extension handles website content and web activity from Colonist pages, including visible game activity and Colonist WebSocket frames. Processing and storage are local. No data is sold, used for advertising or credit decisions, transferred to third parties, or transmitted to the developer. Tracking defaults off until the user reviews the disclosure and chooses **Enable tracking** in the popup.

**Privacy policy URL:** `https://github.com/PranavGopalak/catanatron/blob/codex-dev/colonist-page-watcher/PRIVACY.md`

**Homepage URL:** `https://github.com/PranavGopalak/catanatron/tree/codex-dev/colonist-page-watcher`

**Support URL:** `https://github.com/PranavGopalak/catanatron/issues`

## Reviewer instructions

1. Install the extension and open its toolbar popup.
2. Confirm tracking is off and the local-capture disclosure is visible.
3. Choose **Enable tracking**.
4. Open `https://colonist.io/`, sign in if needed, and start or join a game.
5. Refresh the Colonist tab if it was open before consent.
6. Generate game activity. The packaged dashboard opens as a background tab and updates from local extension storage.
7. Use **Open dashboard** in the popup if you want to inspect the dashboard before live activity appears.
8. Choose **Disable tracking** in the popup to stop new capture.

No external server, localhost process, native application, paid account, or reviewer credentials supplied by the extension developer are required.
