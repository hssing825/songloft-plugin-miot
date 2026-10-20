import assert from 'node:assert/strict';
import test from 'node:test';
import { flush, deferred } from './chat_loader.mjs';
import { load, chatOf, storageOf, DEFAULT_CHAT_CONFIG, validateChatConfig } from './chat_fixture.mjs';
const { SpeechService } = load('../src/chat/speech.ts');
test('waiting feedback defaults on and validates persisted configuration', () => {
  assert.equal(DEFAULT_CHAT_CONFIG.waiting_feedback, true);
  assert.equal(validateChatConfig({ waiting_feedback: false }).waiting_feedback, false);
  assert.throws(() => validateChatConfig({ waiting_feedback: 'true' }));
});
test('model starts alongside acknowledgment; answer waits for acknowledgment', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const hint = deferred(), answer = deferred(), calls = [];
  const h = chatOf(t, {
    config: { waiting_feedback: true }, request: () => { calls.push('model'); return answer.promise; }, speech: {
      acknowledge: async () => { calls.push('hint'); await hint.promise; },
      speak: async (text) => { calls.push(text); return 'completed'; }, stop: async () => { },
    }
  });
  await h.chat.submit('a', 'd', '问题');
  t.mock.timers.tick(0);
  await flush();
  assert.deepEqual(calls, ['model', 'hint']);
  answer.resolve('回答');
  await flush();
  assert.equal(h.chat.status('a', 'd').phase, 'generating');
  hint.resolve();
  await flush();
  assert.deepEqual(calls, ['model', 'hint', '回答']);
  assert.equal(h.chat.status('a', 'd').phase, 'completed');
});
test('cancelling acknowledgment prevents delayed answer and music recovery', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const hint = deferred(), answer = deferred(), calls = [];
  const h = chatOf(t, {
    config: { waiting_feedback: true }, request: () => answer.promise, speech: {
      acknowledge: () => hint.promise, speak: async (text) => { calls.push(text); return 'completed'; }, stop: async () => { },
    }
  });
  await h.chat.submit('a', 'd', '问题');
  t.mock.timers.tick(0);
  await flush();
  await h.chat.cancel('a', 'd');
  answer.resolve('回答');
  hint.resolve();
  await flush();
  assert.deepEqual(calls, []);
  assert.equal(h.chat.status('a', 'd').phase, 'cancelled');
  assert.ok(!h.calls.some(c => Array.isArray(c) && c[0] === 'resume'));
});
test('model failure waits for hint before sending failure speech', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const hint = deferred(), failure = deferred(), calls = [];
  const h = chatOf(t, {
    config: { waiting_feedback: true }, request: () => failure.promise, speech: {
      acknowledge: () => hint.promise, speak: async (text) => { calls.push(text); return 'completed'; }, stop: async () => { },
    }
  });
  await h.chat.submit('a', 'd', '问题');
  t.mock.timers.tick(0);
  await flush();
  failure.reject(new Error('模型失败'));
  await flush();
  assert.deepEqual(calls, []);
  hint.resolve();
  await flush();
  assert.deepEqual(calls, ['抱歉，暂时无法回答，请稍后再试。']);
  assert.equal(h.chat.status('a', 'd').phase, 'failed');
});
test('group waiting feedback speaks only on the requester and preserves recovery', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const answer = deferred();
  const h = chatOf(t, { group: true, config: { waiting_feedback: true }, request: () => answer.promise });
  const speech = new SpeechService(h.devices);
  h.chat.speech.acknowledge = (...args) => speech.acknowledge(...args);
  await h.chat.submit('a', 'd', '问题');
  t.mock.timers.tick(0);
  await flush();
  assert.deepEqual(h.calls.filter(c => Array.isArray(c) && c[0] === 'tts'), [['tts', 'd', '收到，正在思考。']]);
  assert.deepEqual(h.calls.filter(c => Array.isArray(c) && c[0] === 'interrupt').map(c => c[1]), ['d']);
  assert.deepEqual(h.calls.filter(c => Array.isArray(c) && c[0] === 'pause').map(c => c[1]), ['e']);
  answer.resolve('测试答案');
  t.mock.timers.tick(3000);
  await flush();
  assert.equal(h.chat.status('a', 'd').phase, 'completed');
  assert.ok(h.calls.some(c => Array.isArray(c) && c[0] === 'resume' && c[1] === 43));
});
test('answer ready before takeover skips the waiting hint entirely', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = [];
  const h = chatOf(t, {
    config: { waiting_feedback: true }, speech: {
      acknowledge: async () => { calls.push('hint'); }, speak: async (text) => { calls.push(text); return 'completed'; }, stop: async () => { },
    }
  });
  await h.chat.submit('a', 'd', '问题');
  t.mock.timers.tick(0);
  await flush();
  assert.deepEqual(calls, ['测试答案']);
  assert.equal(h.chat.status('a', 'd').phase, 'completed');
});
test('acknowledgment window absorbs the cloud round-trip instead of extending past it', async (t) => {
  storageOf(t);
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const sent = deferred();
  const speech = new SpeechService({ textToSpeech: () => sent.promise });
  let finished = false;
  const pending = speech.acknowledge({ account: 'a', device: 'd', isCurrent: () => true }).then(() => { finished = true; });
  await flush();
  t.mock.timers.tick(1200);
  sent.resolve(true);
  await flush();
  t.mock.timers.tick(1799);
  await flush();
  assert.equal(finished, false);
  t.mock.timers.tick(1);
  await pending;
});
for (const speak of [true, false]) {
  test(`no acknowledgment for ${speak ? 'disabled feedback' : 'text-only test'}`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const calls = [];
    const h = chatOf(t, {
      config: { waiting_feedback: !speak }, speech: {
        acknowledge: async () => { calls.push('hint'); }, speak: async () => 'completed', stop: async () => { },
      }
    });
    await h.chat.submit('a', 'd', '问题', speak);
    t.mock.timers.tick(0);
    await flush();
    assert.deepEqual(calls, []);
    assert.equal(h.chat.status('a', 'd').phase, 'completed');
  });
}
test('acknowledgment failure is logged without failing the answer', async (t) => {
  storageOf(t);
  const speech = new SpeechService({ textToSpeech: async () => { throw new Error('云端失败'); } });
  await speech.acknowledge({ account: 'a', device: 'd', isCurrent: () => true });
});
test('acknowledgment protects brief speech and ignores cancelled tasks', async (t) => {
  storageOf(t);
  // 保护窗口以 Date.now 为基准，必须和假定时器同步推进才能精确到边界。
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let active = false, sends = 0, finished = false;
  const speech = new SpeechService({ textToSpeech: async (_a, _d, text) => { sends++; assert.equal(text, '收到，正在思考。'); return true; } });
  const token = { account: 'a', device: 'd', isCurrent: () => active };
  await speech.acknowledge(token);
  assert.equal(sends, 0);
  active = true;
  const pending = speech.acknowledge(token).then(() => { finished = true; });
  await flush();
  t.mock.timers.tick(2999);
  await flush();
  assert.equal(finished, false);
  t.mock.timers.tick(1);
  await pending;
  assert.equal(sends, 1);
});

test('unconfirmed waiting hint retains startup protection without reporting a failed hint', async t => {
  const h = storageOf(t);
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const speech = new SpeechService({ textToSpeech: async () => null });
  let done = false;
  const pending = speech.acknowledge({ account: 'a', device: 'd', isCurrent: () => true }).then(() => { done = true; });
  await flush();
  t.mock.timers.tick(2999);
  await flush();
  assert.equal(done, false);
  t.mock.timers.tick(1);
  await pending;
  assert.equal(h.logs.some(([, text]) => text.includes('waiting_feedback_failed')), false);
});
