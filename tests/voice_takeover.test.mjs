import assert from 'node:assert/strict';
import test from 'node:test';
import { chatOf, load } from './chat_fixture.mjs';
import { deferred, flush } from './chat_loader.mjs';
const { VoiceDispatcher } = load('../src/voicecmd/dispatcher.ts');

for (const [question, intent, expected] of [
  ['请问地球为什么是圆的', '地球为什么是圆的', ['chat', '地球为什么是圆的']],
  ['播放歌曲请问你是谁', '请问你是谁', ['music', '播放歌曲请问你是谁']],
  ['停止回答', '停止', ['cancel']],
  ['  ', '请问地球为什么是圆的', ['chat', '地球为什么是圆的']],
  [undefined, '请问地球为什么是圆的', ['chat', '地球为什么是圆的']],
]) {
  test(`routing uses the original question before cloud intent: ${JSON.stringify(question)}`, async t => {
    const h = chatOf(t), calls = [];
    const music = {
      cancelPendingResume() {}, hasFixedControl: async () => false,
      handleMessage: async message => { calls.push(['music', message.message.response.answer[0].question]); return true; },
      resumeUnmatched() {},
    };
    const dispatcher = new VoiceDispatcher(h.config, music, {
      status: () => ({ phase: 'completed', followup_until: 0 }),
      interruptForRouting: async () => undefined,
      submit: async (_account, _device, text) => calls.push(['chat', text]),
      cancel: async () => { calls.push(['cancel']); },
    }, h.playback);
    t.after(() => dispatcher.close());
    dispatcher.submit({ account_id: 'a', device_id: 'd', message: {
      request_id: 'question', response: { answer: [{ question, intention: { query: intent } }] },
    } });
    await flush();
    assert.deepEqual(calls, [expected]);
  });
}

for (const group of [false, true]) {
  test(`requester interruption starts without a redundant stop or waiting for other speakers: group=${group}`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const h = chatOf(t, { group, config: { waiting_feedback: true } });
    const other = deferred(), interrupt = deferred(), answer = deferred(), calls = [];
    h.chat.client.request = () => answer.promise;
    h.devices.stopForInteraction = async (_account, device) => {
      calls.push(['stop', device]);
      if (device === 'e') await other.promise;
      return 'stopped';
    };
    h.devices.interruptAnswer = async (_account, device, current) => {
      calls.push(['interrupt', device]);
      await interrupt.promise;
      return { status: current() ? 'accepted' : 'cancelled' };
    };
    h.chat.speech.acknowledge = async () => { calls.push(['hint']); };
    await h.chat.submit('a', 'd', '问题');
    t.mock.timers.tick(0);
    await flush();
    assert.ok(calls.some(c => c[0] === 'interrupt' && c[1] === 'd'), 'interrupt the requester immediately');
    assert.ok(!calls.some(c => c[0] === 'stop' && c[1] === 'd'), 'the two-round interrupt already stops the requester');
    assert.equal(h.chat.status('a', 'd').phase, 'preparing');
    assert.ok(!calls.some(c => c[0] === 'hint'));
    assert.ok(!h.calls.some(c => c[0] === 'speak' || c[0] === 'resume'));
    interrupt.resolve();
    await flush();
    if (group) {
      assert.ok(!calls.some(c => c[0] === 'hint'), 'speech still waits for the group to stop');
      other.resolve();
      await flush();
    }
    assert.equal(calls.filter(c => c[0] === 'hint').length, 1);
    answer.resolve('回答');
    await flush();
    assert.equal(h.chat.status('a', 'd').phase, 'completed');
    assert.equal(h.calls.filter(c => c[0] === 'speak').length, 1);
    assert.deepEqual(h.calls.filter(c => c[0] === 'resume'), [['resume', 43]]);
  });
}

for (const pendingDevice of ['d', 'e']) {
  test(`cancelling while ${pendingDevice} is stopping prevents late speech and recovery`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const h = chatOf(t, { group: true, config: { waiting_feedback: true } });
    const pending = deferred();
    h.devices.stopForInteraction = async (_account, device, current) => {
      if (device === pendingDevice) await pending.promise;
      return current() ? 'stopped' : 'cancelled';
    };
    h.devices.interruptAnswer = async (_account, device, current) => {
      if (device === pendingDevice) await pending.promise;
      return { status: current() ? 'accepted' : 'cancelled' };
    };
    h.chat.speech.acknowledge = async () => { h.calls.push(['hint']); };
    await h.chat.submit('a', 'd', '问题');
    t.mock.timers.tick(0);
    await flush();
    h.control('e');
    pending.resolve();
    await flush();
    assert.equal(h.chat.status('a', 'd').phase, 'cancelled');
    assert.equal(h.chat.busyReason(), '');
    assert.ok(!h.calls.some(c => ['hint', 'speak', 'resume'].includes(c[0])));
  });
}
