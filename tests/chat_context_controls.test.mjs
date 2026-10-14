import assert from 'node:assert/strict';
import test from 'node:test';
import { load, storageOf, configOf, turnOf, chatOf, ChatMemoryService } from './chat_fixture.mjs';
const { ConfigManager } = load('../src/config/manager.ts');
const { DEFAULT_CHAT_CONFIG } = load('../src/chat/types.ts');

test('fresh configurations use inexpensive defaults; persisted legacy settings keep their behavior', async t => {
  const { values } = storageOf(t), config = new ConfigManager();
  const fresh = await config.getChatConfig();
  assert.equal(fresh.context_turns, 3);
  assert.equal(fresh.memory_enabled, false);
  assert.equal(fresh.summary_enabled, false);
  values.set('chat_config:v1', JSON.stringify({ enabled: true, context_turns: 6, memory_enabled: false }));
  const old = await config.getChatConfig();
  assert.equal(old.context_turns, 6);
  assert.equal(old.memory_enabled, false);
  assert.equal(old.summary_enabled, true);
  await config.saveChatConfig({ summary_enabled: false, context_turns: 0 });
  assert.equal((await config.getChatConfig()).summary_enabled, false);
  assert.equal((await config.getChatConfig()).context_turns, 0);
  assert.equal(DEFAULT_CHAT_CONFIG.context_turns, 3);
});

test('zero history sends only the current question and prompt, retaining local history and summary', async t => {
  storageOf(t);
  const memory = new ChatMemoryService();
  await memory.saveTurn('device', turnOf('old'), configOf());
  await memory.mutate('device', value => { value.summary = '很久以前的对话'; });
  const stored = await memory.load('device');
  const config = configOf({ context_turns: 0, summary_enabled: true, memory_enabled: false });
  assert.deepEqual(memory.messages(stored, config, '新问题'), [{ role: 'system', content: config.system_prompt }, { role: 'user', content: '新问题' }]);
  assert.equal((await memory.load('device')).history.length, 1);
  assert.equal((await memory.load('device')).summary, '很久以前的对话');
});

test('recent turn count excludes earlier summary unless explicitly enabled; preferences remain independent', async t => {
  storageOf(t);
  const memory = new ChatMemoryService();
  await memory.saveTurn('device', turnOf('old'), configOf());
  await memory.saveTurn('device', turnOf('recent'), configOf());
  await memory.mutate('device', value => { value.summary = '更早摘要'; });
  await memory.editMemory('device', '喜欢摇滚');
  const stored = await memory.load('device');
  const config = configOf({ context_turns: 1, summary_enabled: false, memory_enabled: false });
  assert.deepEqual(memory.messages(stored, config, '问题').map(m => m.content), [config.system_prompt, '问题recent', '答案recent', '问题']);
  assert.ok(memory.messages(stored, { ...config, summary_enabled: true }, '问题').some(m => m.content.includes('更早摘要')));
  const preferences = memory.messages(stored, { ...config, context_turns: 0, memory_enabled: true }, '推荐摇滚');
  assert.ok(preferences.some(m => m.content.includes('喜欢摇滚')));
  assert.ok(!preferences.some(m => m.content.includes('更早摘要') || m.content === '问题recent'));
});

for (const updates of [{ context_turns: 0, summary_enabled: true }, { context_turns: 3, summary_enabled: false }]) {
  test(`disabled summary causes no background API calls: ${JSON.stringify(updates)}`, async t => {
    const h = chatOf(t);
    for (let i = 0; i < 8; i++) await h.chat.memory.saveTurn('device', turnOf(String(i)), configOf());
    const calls = [];
    h.chat.client.request = async (...args) => { calls.push(args); return '摘要'; };
    await h.chat.maintain('device', configOf({ ...updates, memory_enabled: false }), true);
    assert.deepEqual(calls, []);
  });
}
