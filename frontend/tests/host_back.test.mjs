import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { reactive } from 'vue';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const { outputText } = ts.transpileModule(readFileSync(new URL('../src/runtime.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});

function fixture(width = 375) {
  const document = new EventTarget();
  document.documentElement = { scrollTop: 0 };
  document.body = { scrollTop: 0 };
  const state = { confirm: { open: false } };
  const exports = {};
  new Function('require', 'exports', 'document', 'window', outputText)(name => {
    if (name === 'vue') return { reactive };
    if (name === './store') return { state, resolveConfirm: () => { state.confirm.open = false; } };
    throw new Error(`unexpected dependency: ${name}`);
  }, exports, document, { innerWidth: width });
  const dispose = exports.installHostBack();
  return {
    ...exports, state, dispose,
    back: () => !document.dispatchEvent(new Event('songloft-back', { cancelable: true })),
  };
}

test('host back closes overlays, then lyrics, then full player without leaving the plugin', () => {
  const f = fixture();
  f.openPage('player');
  f.navigation.playerPage = 1;
  f.navigation.playerPopup = 'full-volume';
  f.state.confirm.open = true;
  assert.equal(f.back(), true);
  assert.equal(f.state.confirm.open, false);
  assert.equal(f.navigation.playerPopup, 'full-volume');
  assert.equal(f.back(), true);
  assert.equal(f.navigation.playerPopup, '');
  assert.equal(f.navigation.playerPage, 1);
  assert.equal(f.back(), true);
  assert.equal(f.navigation.playerPage, 0);
  assert.equal(f.navigation.page, 'player');
  assert.equal(f.back(), true);
  assert.equal(f.navigation.page, 'main');
  assert.equal(f.back(), false);
});

test('reopening the player starts on the cover; desktop back closes the player directly', () => {
  const f = fixture(1280);
  f.openPage('player');
  f.navigation.playerPage = 1;
  assert.equal(f.back(), true);
  assert.equal(f.navigation.page, 'main');
  f.openPage('player');
  assert.equal(f.navigation.playerPage, 0);
});

test('existing device picker, editor and settings back order is preserved', () => {
  const f = fixture();
  f.openPage('settings');
  f.navigation.settingsCategory = 'voice';
  f.navigation.editorOpen = true;
  f.navigation.devicePickerOpen = true;
  assert.equal(f.back(), true);
  assert.equal(f.navigation.devicePickerOpen, false);
  assert.equal(f.navigation.editorOpen, true);
  assert.equal(f.back(), true);
  assert.equal(f.navigation.editorOpen, false);
  assert.equal(f.back(), true);
  assert.equal(f.navigation.settingsCategory, '');
  assert.equal(f.navigation.page, 'settings');
  assert.equal(f.back(), true);
  assert.equal(f.navigation.page, 'main');
});

test('unmounted app no longer consumes host back', () => {
  const f = fixture();
  f.openPage('player');
  f.dispose();
  assert.equal(f.back(), false);
  assert.equal(f.navigation.page, 'player');
});
