'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function assertFile(relativePath) {
  assert.equal(fs.existsSync(path.join(root, relativePath)), true, `missing ${relativePath}`);
}

const manifest = readJson('manifest.json');
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.background.service_worker, 'background-worker.js');
assert.deepEqual(manifest.background.scripts, ['lib/browser-polyfill.min.js', 'core.js', 'background.js']);
assert.equal(manifest.browser_specific_settings.gecko.background, undefined, 'Firefox background must not be nested under gecko');
assert.ok(Number.parseInt(manifest.minimum_chrome_version, 10) >= 121);
assert.ok(Number.parseInt(manifest.browser_specific_settings.gecko.strict_min_version, 10) >= 140);
assert.deepEqual(manifest.browser_specific_settings.gecko.data_collection_permissions.required, ['browsingActivity']);
assert.deepEqual(manifest.permissions, ['storage']);
assert.deepEqual(
  [...manifest.host_permissions].sort(),
  ['*://*.youtube.com/*', 'https://sponsor.ajay.app/*'].sort()
);

for (const [name, command] of Object.entries(manifest.commands || {})) {
  for (const [platform, shortcut] of Object.entries(command.suggested_key || {})) {
    assert.match(
      shortcut,
      /^(Ctrl|Alt|Command|MacCtrl)\+/,
      `${name}.${platform} needs a primary modifier`
    );
    assert.notEqual(shortcut, 'Ctrl+Shift+W', `${name}.${platform} uses a reserved close-window shortcut`);
  }
}

assertFile(manifest.background.service_worker);
for (const script of manifest.background.scripts) assertFile(script);
for (const entry of manifest.content_scripts || []) {
  for (const script of entry.js || []) assertFile(script);
  for (const stylesheet of entry.css || []) assertFile(stylesheet);
}

for (const locale of fs.readdirSync(path.join(root, '_locales'))) {
  readJson(path.join('_locales', locale, 'messages.json'));
}

const jsFiles = [];
function collectJavaScript(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectJavaScript(fullPath);
    else if (entry.name.endsWith('.js')) jsFiles.push(fullPath);
  }
}
collectJavaScript(root);

for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${path.relative(root, file)} syntax failed:\n${result.stderr}`);
}

for (const runtimeFile of ['background.js', 'content.js', 'popup.js', 'settings.js']) {
  const source = fs.readFileSync(path.join(root, runtimeFile), 'utf8');
  assert.doesNotMatch(source, /\bchrome\./, `${runtimeFile} must use Promise-safe browser.* APIs`);
}

const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const settings = fs.readFileSync(path.join(root, 'settings.html'), 'utf8');
for (const shortcut of ['Alt+Shift+S', 'Alt+Shift+W']) {
  assert.match(readme, new RegExp(shortcut.replaceAll('+', '\\+')));
  assert.match(settings, new RegExp(shortcut.replaceAll('+', '\\+')));
}
const privacy = fs.readFileSync(path.join(root, 'PRIVACY.md'), 'utf8');
assert.match(privacy, /browsingActivity/);
assert.match(privacy, /deterministic/i);
assert.doesNotMatch(privacy, /does \*\*not\*\* collect, store, or transmit/i);

const custodyLines = fs.readFileSync(path.join(root, 'evidence/preexisting-lib.sha256'), 'utf8')
  .trim()
  .split('\n');
for (const line of custodyLines) {
  const match = line.match(/^([a-f0-9]{64})  (.+)$/);
  assert.ok(match, `invalid custody line: ${line}`);
  const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, match[2]))).digest('hex');
  assert.equal(actual, match[1], `pre-existing file changed: ${match[2]}`);
}

console.log(`check-package: manifest, ${jsFiles.length} scripts, locales, permissions, commands, and custody OK`);
