const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const script = fs.readFileSync(path.join(root, 'scripts', 'build-amo-source.ps1'), 'utf8');
if (!script.includes('AMO-SUBMISSION.md') || !script.includes('PRIVACY.md') || !script.includes('FIREFOX-INSTALL-CHECKLIST.md') || !script.includes('scripts')) {
  throw new Error('AMO source package script is missing review artifacts');
}
const zip = path.join(root, 'dist', `colonist-page-watcher-source-${manifest.version}.zip`);
if (fs.existsSync(zip)) {
  const bytes = fs.readFileSync(zip).toString('latin1');
  for (const expected of ['AMO-SUBMISSION.md', 'PRIVACY.md', 'FIREFOX-INSTALL-CHECKLIST.md', 'README.md', 'manifest.json', 'src/background.js', 'dashboard/app.js', 'scripts/validate-all.cjs']) {
    if (!bytes.includes(expected)) throw new Error(`AMO source zip should contain ${expected}`);
  }
}
console.log('AMO source package smoke test ok');
