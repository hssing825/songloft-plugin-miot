import assert from 'node:assert/strict';
import test from 'node:test';
import { chatOf, load } from './chat_fixture.mjs';
import { deferred, flush } from './chat_loader.mjs';
const { AIClient } = load('../src/ai/client.ts');

test('model starts during cloud takeover; partial text reaches the page but never reaches TTS', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stop = deferred(), answer = deferred();
  let control, started = false;
  const h = chatOf(t, { request: async (_config, _messages, _kind, _current, _scope, options) => { started = true; control = options; return answer.promise; } });
  h.devices.interruptAnswer = () => stop.promise;
  await h.chat.submit('a', 'd', '问题');
  t.mock.timers.tick(0); await flush();
  assert.equal(started, true);
  control.onProgress('部分回答');
  assert.equal(h.chat.status('a', 'd').answer, '部分回答');
  assert.ok(!h.calls.some(c => c[0] === 'speak' || c[0] === 'tts'));
  stop.resolve({ status: 'accepted' }); await flush();
  assert.ok(!h.calls.some(c => c[0] === 'speak'));
  answer.resolve('完整回答'); await flush();
  assert.deepEqual(h.calls.filter(c => c[0] === 'speak'), [['speak', 'd', '完整回答']]);
  assert.equal(h.chat.status('a', 'd').phase, 'completed');
});

test('DLNA rejection sends no model request; failed takeover cancels its model and sends no TTS', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let requests = 0;
  const h = chatOf(t, { external: true, request: async () => { requests++; return '回答'; } });
  await h.chat.submit('a', 'd', '问题'); t.mock.timers.tick(0); await flush();
  assert.equal(requests, 0);
  assert.equal(h.chat.status('a', 'd').phase, 'failed');
  const failure = chatOf(t, { interruptResult: 'failed', request: async () => '回答' });
  await failure.chat.submit('a', 'd', '问题'); t.mock.timers.tick(0); await flush();
  assert.equal(failure.chat.status('a', 'd').phase, 'failed');
  assert.ok(!failure.calls.some(c => c[0] === 'speak' || c[0] === 'tts'));
});

test('new question cancels the old stream; old cleanup cannot cancel the replacement request', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = chatOf(t), requests = [];
  songloft.net = { httpStream() {
    const pending = deferred();
    const request = { cancelled: false, pending };
    requests.push(request);
    return { response: Promise.resolve({ status: 200, headers: { 'Content-Type': ['text/event-stream'] } }),
      read: () => pending.promise,
      cancel: async () => { request.cancelled = true; pending.reject(new Error('cancelled')); } };
  } };
  h.chat.client = new AIClient();
  await h.chat.submit('a', 'd', '旧问题', false); t.mock.timers.tick(0); await flush();
  await h.chat.submit('a', 'd', '新问题', false); t.mock.timers.tick(0); await flush();
  assert.equal(requests.length, 2);
  assert.equal(requests[0].cancelled, true);
  assert.equal(requests[1].cancelled, false);
  const frame = 'data: {"choices":[{"delta":{"content":"新回答"}}]}\n\ndata: [DONE]\n\n';
  requests[1].pending.resolve(new TextEncoder().encode(frame)); await flush();
  assert.equal(h.chat.status('a', 'd').phase, 'completed');
  assert.equal(h.chat.status('a', 'd').answer, '新回答');
});
