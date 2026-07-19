const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const manifest = JSON.parse(read('manifest.json'));
const background = read('src', 'background.js');
const content = read('src', 'content.js');
const wsCore = read('src', 'ws-core.js');
const popupHtml = read('src', 'popup.html');
const popupJs = read('src', 'popup.js');
const dashboardHtml = read('dashboard', 'index.html');
const dashboardJs = read('dashboard', 'app.js');
const dashboardCss = read('dashboard', 'styles.css');
const buildScript = read('scripts', 'build-firefox-xpi.ps1');
const buildReleaseScript = read('scripts', 'build-release.ps1');
const amoSourceScript = read('scripts', 'build-amo-source.ps1');
const readme = read('README.md');
const privacy = read('PRIVACY.md');
const amoNotes = read('AMO-SUBMISSION.md');
const firefoxChecklist = read('FIREFOX-INSTALL-CHECKLIST.md');
const validateAll = read('scripts', 'validate-all.cjs');
const legacyLocalFiles = [
  'scripts/localhost-ui.cjs',
  'scripts/native-host.cjs',
  'scripts/install-native-host.ps1',
  'scripts/colonist-watcher-native-host.cmd',
  'scripts/colonist-watcher-native-host.json',
];

function hasNoLocalhostRuntime() {
  assert(!manifest.permissions.includes('nativeMessaging'), 'manifest must not require native messaging');
  assert(!manifest.host_permissions.some((permission) => /^http:\/\/(localhost|127\.0\.0\.1)/.test(permission)), 'manifest must not request localhost host permissions');
  for (const file of legacyLocalFiles) {
    assert(!fs.existsSync(path.join(root, file)), file + ' must not exist in extension-only release');
  }
  assert(!dashboardJs.includes('/api/') && !dashboardJs.includes('fetch(') && !dashboardJs.includes('http://localhost'), 'dashboard must not use local API fallback');
  for (const [name, source] of Object.entries({ background, content })) {
    assert(!source.includes('connectNative'), `${name} must not use native messaging`);
    assert(!source.includes('http://localhost') && !source.includes('http://127.0.0.1'), `${name} must not depend on localhost`);
  }
}

function hasAutomaticGameDashboard() {
  const contentScript = manifest.content_scripts?.[0] || {};
  assert(contentScript.js?.includes('src/ws-core.js'), 'content script must load WebSocket decoder for auto game-start detection');
  assert(content.includes('function resetForNewGame(') && content.includes('hasGameStartFrame') && content.includes('colonistWatcherAutoResetAt') && content.includes('colonistWatcherAutoResetReason') && content.includes('GAME_START_RESET_DEBOUNCE_MS') && !content.includes('seenGameStartForSession'), 'content must auto-reset logs on each debounced decoded game_start');
  assert(manifest.background?.scripts?.includes('src/background.js'), 'Firefox background script is required');
  assert(background.includes('const DASHBOARD_PATH = "dashboard/index.html"'), 'background must target packaged dashboard');
  assert(background.includes('chrome.runtime.getURL(DASHBOARD_PATH)'), 'background must open extension dashboard URL');
  assert(background.includes('snapshot.session?.activeReason === "websocket"'), 'dashboard must open from websocket game activity');
  assert(background.includes('chrome.tabs.create({ url: dashboardUrl(), active: false })'), 'auto-open should not steal focus from the game');
  assert(background.includes('chrome.tabs.remove(tab.id)'), 'dashboard should auto-close after leaving Colonist');
  assert(background.includes('async function reconcileOpenTabs(') && background.includes('onStartup') && background.includes('onInstalled'), 'background should reconcile restored tabs after startup/install');
  assert(validateAll.includes('scripts/background-smoke-test.cjs'), 'full validation should execute background auto-open behavior smoke test');
  assert(content.includes('const WEBSOCKET_FRAME_LIMIT = 20000'), 'long games must retain setup frames');
  assert(content.includes('compactPlayerContext') && content.includes('colonistWatcherPlayerContext'), 'game reset must preserve player roster identity');
}

function hasLiveTrackingDashboard() {
  assert(dashboardHtml.includes('../src/ws-core.js'), 'dashboard must load packaged WebSocket decoder');
  assert(dashboardJs.includes('chrome.storage.local'), 'dashboard must read extension storage directly');
  assert(dashboardHtml.includes('stateReset') && dashboardJs.includes('colonistWatcherAutoResetAt') && dashboardJs.includes('function formatResetStatus('), 'dashboard must show automatic/manual session reset status');
  assert(dashboardHtml.includes('stateVersion') && dashboardJs.includes('function extensionVersion(') && dashboardJs.includes('getManifest'), 'dashboard must show installed extension version');
  assert(dashboardHtml.includes('headerVersion') && dashboardJs.includes('text("headerVersion"'), 'dashboard header must always show the installed version');
  assert(popupHtml.includes('popupVersion') && popupJs.includes('chrome.runtime.getManifest().version'), 'popup header must always show the installed version');
  assert(popupJs.includes('colonistWatcherAutoResetReason: "manual-reset"'), 'popup reset should record manual reset reason');
  assert(dashboardJs.includes('const refreshMs = 500') && dashboardJs.includes('setInterval(load, refreshMs)'), 'dashboard must refresh every 0.5 seconds');
  assert(dashboardJs.includes('function buildMappedTracker('), 'dashboard must rebuild card tracker');
  assert(dashboardJs.includes('WIN RISK') && dashboardJs.includes('HIDDEN VP RISK'), 'dashboard must flag trade win risk');
  assert(dashboardHtml.includes('winWatch') && dashboardJs.includes('function buildWinWatch(') && dashboardJs.includes('function renderWinWatch('), 'dashboard must show current player win-risk watch');
  assert(dashboardHtml.includes('devDeckWatch') && dashboardJs.includes('function buildDevDeckWatch(') && dashboardJs.includes('monopoly: 2'), 'dashboard must show dev deck exhaustion watch');
  assert(dashboardJs.includes('uncertaintyCount') && dashboardJs.includes('renderMetric("uncertain"'), 'dashboard should populate Unknown metric from real uncertainty');
  assert(wsCore.includes('11: "knight"') && wsCore.includes('extractDevelopmentCardPurchaseEvents'), 'decoder must map Knights and development-card purchases');
  assert(wsCore.includes('compositionKnown') && wsCore.includes('localPlayerName'), 'decoder must infer local hand identity and snapshot certainty');
  assert(dashboardJs.includes('reconcileTrackerWithHands') && dashboardJs.includes('handTotal') && dashboardJs.includes('estimateConflict'), 'dashboard must constrain estimates to exact server hand totals');
  assert(dashboardJs.includes('card_1: "lumber"') && dashboardJs.includes('card_5: "ore"'), 'dashboard must use the verified protocol resource mapping');
  assert(!dashboardHtml.includes('Resource Mapping'), 'normal dashboard must not expose obsolete resource guessing controls');
  assert(validateAll.includes('scripts/ws-state-smoke-test.cjs'), 'full validation must run WebSocket state regression coverage');
  assert(dashboardJs.includes('function playerColorValue(') && dashboardJs.includes('numeric * 67'), 'unknown player colors must receive stable distinct visual hues');
  assert(dashboardCss.includes('.resource-card') && dashboardCss.includes('.trade-warning') && dashboardCss.includes('.win-watch-card') && dashboardCss.includes('.dev-watch-card.exhausted') && dashboardCss.includes('.state-strip') && dashboardCss.includes('.player.color-2'), 'dashboard must include clean color-coded UI');
}

function hasUsablePopup() {
  assert(popupHtml.includes('id="openDashboard"') && popupHtml.includes('class="primary-action"'), 'popup should make Dashboard the primary action');
  assert(popupJs.includes('chrome.runtime.getURL("dashboard/index.html")'), 'popup Dashboard button must open packaged dashboard');
  assert(popupHtml.includes('id="scan"') && popupHtml.includes('secondary-action'), 'scan should remain as secondary fallback');
}

function hasFirefoxReadyPackage() {
  assert(manifest.browser_specific_settings?.gecko?.id, 'gecko id is required for Firefox storage continuity/signing');
  assert(manifest.icons?.['48'] === 'assets/icon-48.png', 'extension must define branded icons');
  assert(manifest.action?.default_icon?.['32'] === 'assets/icon-32.png', 'toolbar action must define icon');
  assert(fs.existsSync(path.join(root, 'assets', 'icon-48.png')), 'icon asset must exist');
  assert(buildScript.includes('Join-Path $Root "dashboard"'), 'build must package dashboard');
  assert(buildScript.includes('Join-Path $Root "assets"'), 'build must package assets');
  assert(buildReleaseScript.includes('node scripts\\validate-all.cjs'), 'release build should run full validation');
  assert(buildReleaseScript.includes('scripts\\build-firefox-xpi.ps1') && buildReleaseScript.includes('scripts\\build-amo-source.ps1'), 'release build should create both XPI and source ZIP');
  assert(buildReleaseScript.includes('node scripts\\write-release-metadata.cjs') && buildReleaseScript.includes('node scripts\\release-metadata-smoke-test.cjs'), 'release build should write and verify metadata');
  assert(amoSourceScript.includes('AMO-SUBMISSION.md') && amoSourceScript.includes('PRIVACY.md') && amoSourceScript.includes('FIREFOX-INSTALL-CHECKLIST.md'), 'AMO source build must package signing notes and install checklist');

  const xpi = path.join(root, 'dist', `colonist-page-watcher-${manifest.version}.xpi`);
  assert(fs.existsSync(xpi), 'rebuilt XPI must exist');
  const bytes = fs.readFileSync(xpi).toString('latin1');
  for (const expected of [
    'manifest.json',
    'dashboard/app.js',
    'dashboard/index.html',
    'dashboard/styles.css',
    'src/background.js',
    'src/content.js',
    'src/popup.js',
    'src/ws-core.js',
    'assets/icon-48.png',
  ]) {
    assert(bytes.includes(expected), `XPI must contain ${expected}`);
  }
}

function hasSigningAndPrivacyNotes() {
  assert(readme.includes('Normal Firefox use'), 'README should lead with normal Firefox use');
  assert(readme.includes('node scripts\\validate-all.cjs') && readme.includes('scripts\\build-release.ps1'), 'README should point validation to validate-all instead of stale manual lists');
  assert(!readme.includes('node --check src\\core.js'), 'README should not carry stale piecemeal validation command lists');
  assert(readme.includes('No localhost dashboard server or native host is needed for normal use'), 'README should state no local runtime is needed');
  assert(readme.includes('AMO-SUBMISSION.md') && readme.includes('PRIVACY.md'), 'README should link signing/privacy notes');
  assert(privacy.includes('Normal use does not send data to a remote server, localhost process, native host, analytics service, or third party.'), 'privacy note should state local-only behavior');
  assert(amoNotes.includes('unlisted/self-distributed') && amoNotes.includes('Suggested Reviewer Notes'), 'AMO notes should support signing submission');
  assert(readme.includes('FIREFOX-INSTALL-CHECKLIST.md') && amoNotes.includes('FIREFOX-INSTALL-CHECKLIST.md'), 'README and AMO notes should link install checklist');
  assert(firefoxChecklist.includes('Permanent Firefox Verification') && firefoxChecklist.includes('Version v0.1.8') && firefoxChecklist.includes('No local server'), 'install checklist should cover restart verification and normal no-command use');
  assert(firefoxChecklist.includes('scripts\\build-release.ps1') && readme.includes('scripts\\build-release.ps1'), 'release docs should point to the one-command release builder');
}

hasNoLocalhostRuntime();
hasAutomaticGameDashboard();
hasLiveTrackingDashboard();
hasUsablePopup();
hasFirefoxReadyPackage();
hasSigningAndPrivacyNotes();

console.log('release audit ok');
