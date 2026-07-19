const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const background = fs.readFileSync(path.join(root, 'src', 'background.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'dashboard', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'dashboard', 'app.js'), 'utf8');
const content = fs.readFileSync(path.join(root, 'src', 'content.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'dashboard', 'styles.css'), 'utf8');
const buildScript = fs.readFileSync(path.join(root, 'scripts', 'build-firefox-xpi.ps1'), 'utf8');
const icon48 = path.join(root, 'assets', 'icon-48.png');

assert(!manifest.permissions.includes('nativeMessaging'), 'dashboard must not require native messaging');
assert(!manifest.host_permissions.some((permission) => /^http:\/\/(localhost|127\.0\.0\.1)/.test(permission)), 'dashboard must not require localhost host permissions');
assert(manifest.permissions.includes('storage'), 'dashboard needs storage permission');
assert(manifest.permissions.includes('tabs'), 'background needs tabs permission to open dashboard');
assert(manifest.icons?.['48'] === 'assets/icon-48.png' && manifest.action?.default_icon?.['32'] === 'assets/icon-32.png', 'extension should ship branded icons');
assert(fs.existsSync(icon48) && fs.statSync(icon48).size > 100, 'icon asset should exist');

assert(background.includes('chrome.runtime.getURL(DASHBOARD_PATH)'), 'background should open packaged extension dashboard');
assert(background.includes('dashboard/index.html'), 'background should target dashboard HTML');
assert(!background.includes('connectNative'), 'background should not connect to a native host');
assert(!background.includes('http://localhost'), 'background should not open localhost');
assert(!background.includes('/api/live'), 'background should not post to localhost API');
assert(background.includes('function activateGameDashboard('), 'background should have an explicit game-activity dashboard launcher');
assert(background.includes('function scheduleDashboardClose(') && background.includes('chrome.tabs.remove'), 'background should close dashboard after leaving Colonist tabs');
assert(background.includes('async function reconcileOpenTabs(') && background.includes('onStartup') && background.includes('onInstalled'), 'background should reconcile restored tabs after startup/install');
assert(background.includes('snapshot.session?.activeReason === \"websocket\"'), 'dashboard should open on websocket game activity');
assert(!/COLONIST_WATCHER_PAGE_ACTIVE[\s\S]{0,160}maybeOpenDashboard/.test(background), 'PAGE_ACTIVE should not immediately open dashboard');

assert(index.includes('../src/ws-core.js'), 'dashboard should load WebSocket decoder from extension package');
assert(index.includes('app.js'), 'dashboard should load dashboard app');
assert(index.includes('headerVersion'), 'dashboard header should expose installed version');
assert(index.includes('stateSource') && index.includes('stateUpdated') && index.includes('stateFrames') && index.includes('stateEvents') && index.includes('stateReset') && index.includes('stateVersion'), 'dashboard should show concise live state fields');
assert(index.includes('tradeVerdict') && index.includes('tradeVerdictTitle') && index.includes('tradeVerdictBody'), 'dashboard should show an always-visible latest trade verdict');
assert(index.includes('winWatch') && index.includes('Win Watch'), 'dashboard should show current win-risk watch panel');
assert(app.includes('function isExtensionPage()'), 'dashboard should detect extension runtime');
assert(app.includes('function extensionVersion(') && app.includes('getManifest'), 'dashboard should display installed extension version');
assert(app.includes('chrome.storage.local'), 'dashboard should read extension storage directly');
assert(!app.includes('/api/') && !app.includes('fetch(') && !app.includes('http://localhost'), 'dashboard should not use a local API fallback');
assert(app.includes('const refreshMs = 500') && app.includes('setInterval(load, refreshMs)'), 'dashboard should refresh every 0.5 seconds');
assert(app.includes('formatUpdateAge') && app.includes('Last game stream is idle'), 'dashboard should distinguish fresh and stale game streams');
assert(app.includes('function formatResetStatus(') && app.includes('colonistWatcherAutoResetReason'), 'dashboard should show automatic/manual session reset status');
assert(app.includes('function buildMappedTracker('), 'dashboard should use mapped card tracker with costs');
assert(app.includes('function renderTradeWarnings('), 'dashboard should render trade warnings');
assert(app.includes('function buildWinWatch(') && app.includes('function renderWinWatch(') && app.includes('WIN NOW'), 'dashboard should render current player win risk');
assert(app.includes('uncertaintyCount') && app.includes('renderMetric("uncertain"'), 'dashboard should populate the Unknown metric from tracker uncertainty');
assert(content.includes('function resetForNewGame(') && content.includes('hasGameStartFrame') && content.includes('colonistWatcherAutoResetAt') && content.includes('colonistWatcherAutoResetReason') && content.includes('GAME_START_RESET_DEBOUNCE_MS') && !content.includes('seenGameStartForSession'), 'content should auto-reset stored logs on each debounced game start');
assert(!content.includes('streamStoredSnapshot(\"start\")'), 'content should not stream old stored snapshots on page start');
assert(!content.includes('LOCALHOST_STREAM_MIN_MS') && !content.includes('lastLocalhostStreamAt'), 'content should not contain localhost runtime naming');
assert(css.includes('.resource-card'), 'dashboard should include color-coded resource cards');
assert(css.includes('.trade-warning'), 'dashboard should include trade warning styling');
assert(css.includes('.dev-watch-card') && css.includes('.dev-watch-card.exhausted'), 'dashboard should include dev deck watch styling');
assert(css.includes('.win-watch-card') && css.includes('.win-watch-card.danger'), 'dashboard should include current win-risk styling');
assert(css.includes('.state-strip'), 'dashboard should style live state strip');

assert(buildScript.includes('Join-Path $Root "dashboard"'), 'XPI build must include dashboard files');
assert(buildScript.includes('Join-Path $Root "assets"'), 'XPI build must include icon assets');

const xpi = path.join(root, 'dist', 'colonist-page-watcher-0.1.8.xpi');
if (fs.existsSync(xpi)) {
  const bytes = fs.readFileSync(xpi);
  const text = bytes.toString('latin1');
  for (const expected of ['dashboard/app.js', 'dashboard/index.html', 'dashboard/styles.css', 'src/background.js', 'src/ws-core.js', 'assets/icon-48.png']) {
    assert(text.includes(expected), `XPI should contain ${expected}`);
  }
}

console.log('dashboard smoke test ok');
