import assert from 'node:assert/strict';
import test from 'node:test';
import { load, storageOf } from './chat_fixture.mjs';
import { deferred, flush } from './chat_loader.mjs';
const { SSEParser, readChatStream } = load('../src/ai/sse.ts');
const { AIClient } = load('../src/ai/client.ts');
const encode = s => new TextEncoder().encode(s);
const frame = content => `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content } }] })}\n\n`;
const config = { enabled: true, api_url: 'https://model.test/v1', api_key: 'secret-test', model: 'test', timeout: 30 };

test('SSE accepts byte splits, UTF-8 BOM, CR/LF/CRLF, comments and multiline data', () => {
  const events = [], parser = new SSEParser(s => events.push(s));
  const bytes = encode('\uFEFF: heartbeat\r\ndata: 中文\rdata: second\r\rdata: tail\n\ndata: incomplete');
  for (const byte of bytes) parser.feed(new Uint8Array([byte]));
  assert.deepEqual(events, ['中文\nsecond', 'tail']);
  assert.throws(() => parser.feed(encode('x'.repeat(65537))), /长度/);
});

test('SSE publishes content before EOF and excludes reasoning; DONE releases the reader', async () => {
  const pending = deferred(), progress = [];
  const chunks = [encode('data: {"choices":[{"delta":{"reasoning_content":"私密思考"}}]}\n\n' + frame('第一句。'))];
  let reads = 0;
  const result = readChatStream({ read: async () => ++reads === 1 ? chunks[0] : pending.promise }, () => true, s => progress.push(s));
  await flush();
  assert.deepEqual(progress, ['第一句。']);
  pending.resolve(encode(frame('第二句。') + 'data: [DONE]\n\n'));
  assert.equal(await result, '第一句。第二句。');
});

for (const [name, text, error] of [
  ['interrupted', frame('部分回答'), /未完成/],
  ['reasoning only', 'data: {"choices":[{"delta":{"reasoning_content":"x"}}]}\n\ndata: [DONE]\n\n', /空回答/],
  ['invalid event', 'data: bad-json\n\n', /JSON/],
  ['upstream error', 'data: {"error":{"message":"secret"}}\n\n', /返回错误/],
  ['filtered', frame('部分') + 'data: {"choices":[{"delta":{},"finish_reason":"content_filter"}]}\n\n', /未正常结束/],
]) {
  test(`SSE ${name} is not a successful answer`, async () => {
    let once = false;
    await assert.rejects(readChatStream({ read: async () => once ? null : (once = true, encode(text)) }, () => true, () => {}), error);
  });
}

test('client uses a single streaming request and aborts the upstream on scope cancellation', async t => {
  storageOf(t);
  const pending = deferred();
  let cancelled = 0, reads = 0, calls = 0;
  songloft.net = { httpStream(url, init) {
    calls++;
    assert.equal(url, 'https://model.test/v1/chat/completions');
    assert.equal(JSON.parse(init.body).stream, true);
    return { response: Promise.resolve({ status: 200, headers: { 'Content-Type': ['text/event-stream'] } }),
      read: () => ++reads === 1 ? Promise.resolve(encode(frame('部分'))) : pending.promise,
      cancel: async () => { cancelled++; pending.reject(new Error('cancelled secret-test')); } };
  } };
  const client = new AIClient(), progress = [];
  const answer = client.request(config, [{ role: 'user', content: '问' }], 'chat', () => true, 'device', { onProgress: s => progress.push(s) });
  const rejected = assert.rejects(answer, /cancelled/);
  await flush();
  assert.deepEqual(progress, ['部分']);
  client.cancelScope('device');
  await rejected;
  assert.ok(cancelled >= 1);
  assert.equal(calls, 1);
});

test('stream request may return JSON without repeating the model call; compatibility option uses fetch', async t => {
  storageOf(t);
  let calls = 0;
  songloft.net = { httpStream() {
    calls++;
    let read = false;
    return { response: Promise.resolve({ status: 200, headers: { 'Content-Type': ['application/json'] } }),
      read: async () => read ? null : (read = true, encode(JSON.stringify({ choices: [{ message: { content: '完整回答' } }] }))), cancel: async () => {} };
  } };
  const client = new AIClient();
  assert.equal(await client.request(config, [], 'chat'), '完整回答');
  assert.equal(calls, 1);
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    assert.equal(JSON.parse(init.body).stream, false);
    return Response.json({ choices: [{ message: { content: '兼容回答' } }] });
  });
  assert.equal(await client.request(config, [], 'chat', () => true, '', { streaming: false }), '兼容回答');
  assert.equal(calls, 1);
});
