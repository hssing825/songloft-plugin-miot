# MIoT Plugin Development Lessons

## Scope and Sources

Record device state, playback/transitions, voice/hourly recovery, and frontend behavior in songloft-org/songloft-plugin-miot. See the [local AI workflow](docs/en/ai-development.md) and parent host constraints. Existing AGENTS/business references remain authoritative; link evidence rather than duplicating incident histories.

## Recording and Promotion

Include rule, scope, full owner/repo#number, failure/fix commit SHAs, actual validation, and Done right examples (pending if unavailable). Seen counts independent events on distinct dates, not repeated reviews. Three dates make promotion candidates; mark the authoritative destination. Existing hard rules/serious failures apply immediately. Synchronize the [Chinese version](LESSONS.md), never invent counts/resolution/device acceptance, and redact sensitive information.

## Entries

### MIOT-003: A recovery task can outlive the timer that started it

- Scope: voice recovery tasks, hourly recovery, and timer compatibility with older hosts.
- Feedback: [latest songloft-org/songloft#481 comment](https://github.com/songloft-org/songloft/issues/481#issuecomment-6160171475), 2026-10-14: long recovery waits and tracks ending without advancing. The log creates hourly recovery at 11:00:47.820, sends bare play at 11:00:59.323, and repushes only at 11:01:04.319 after status=0. A next-track timer registered at 10:06:44.505 has no firing entry. The log has neither a backend SHA nor timer IDs, so that missing timer cannot be conclusively attributed to handle reuse.
- Reproduction: at baseline `0ba32df6314542856dfc4f9253400f59e373acc6`, a started voice task retains its expired timeout handle. Using the timer-reuse semantics of released host v2.13.1, cancelling the recovered task deletes a transition timer that reused the same ID; the new regression fails on the isolated old implementation because the next-track URL is never sent. Host [32ff4ca](https://github.com/songloft-org/songloft/commit/32ff4ca8002d898fdf79012772610e2c8e45f3f1) fixes global handle reuse but is absent from v2.13.1; updating only the plugin does not update the host.
- Fix: this change clears the handle immediately in its callback, retaining task identity for background verification and cancellation. After consecutive fresh idle confirmations, voice/hourly recovery directly repushes a safe seek URL when status=0/3 has neither position nor stream duration, avoiding ineffective bare play and another verification round. Media-bearing or paused states retain resume verification. Hourly recovery allows at most four fast queries plus one late idle confirmation; a failed query immediately restores normal spacing rather than continuously bypassing backoff.
- Done right: all ten new cases fail for the intended behavior on the isolated old implementation. The fix passes all 862 plugin tests, 62 frontend tests, type checks, build/package validation, and parent `make check`. Coverage includes actual URLs for two consecutive natural transitions after cancellation on a recycling host, missing media, the shared five-second cache, half-second cloud responses, speech waiting, and failure backoff. Simulated repush completes three seconds after voice scheduling or two seconds after hourly task creation with two half-second responses; this excludes conversation discovery, interruption detection, and real device buffering, and is not a promise of matching device latency.
- Not run: audible L15A playback, original problem tracks, and long-running acceptance; the reporter's backend version still needs confirmation. The existing twenty-second background interruption-detection cadence remains; this change shortens recovery after interruption has been confirmed.
- Seen 1× (2026-10-14). Status: lesson; see the device regression matrix in [AGENTS.en.md](AGENTS.en.md).

### MIOT-002: Report asynchronous submission and subsequent page refresh separately

- Scope: AI chat tests and other page actions that refresh history after submission.
- Feedback: [songloft-org/songloft-plugin-miot#119](https://github.com/songloft-org/songloft-plugin-miot/issues/119#issuecomment-6158362927), 2026-10-14: the page reported failure while the speaker read the answer. No specific error was supplied, so the reported root cause remains unconfirmed.
- Reproduction and fix: the page at baseline `adace3586ed187555da5831e9d3926a0521403bb` handled `POST /chat/messages` and subsequent history refresh through one error path. With successful submission and a failed history read, the new test failed on the old implementation's error feedback. The current uncommitted worktree separates history warnings from submission/task errors and prevents stale refresh warnings from affecting a new device or newer refresh.
- Done right: frontend tests cover successful feedback for accepted questions, separate history warnings, and stale-error rejection. Docker Chrome used a 202 acceptance and simulated history 500 to verify the cleared question, absence of submission errors, and eventual answer in history; a test-service readback confirmed completion. The browser fixture is independent of the speaker cloud and does not establish the reporter's exact failure path or audible device speech.
- Seen 1× (2026-10-14). Status: lesson.

### MIOT-001: Distinguish successful idle samples from query failures when tail progress disappears

- Scope: automatic transitions on devices whose stream duration differs from song metadata.
- Failure: [latest feedback on songloft-org/songloft#495](https://github.com/songloft-org/songloft/issues/495#issuecomment-6144580047), 2026-10-13. The earlier fix [4aeadc5](https://github.com/songloft-org/songloft-plugin-miot/commit/4aeadc559a04c5ddf329277425e4df3660d17f8a) protected continuously advancing playback, but the device removed `play_song_detail` at natural completion. Successful idle responses were treated as missing progress alone. Logs repeatedly reported `status=0, hasPosition=false, duration=0` from 19:28:01 to 19:28:25; transition waited for grace expiry, leaving silence.
- Fix: uncommitted worktree based on `587b77f000d7af4b022229b293bc519b3a957851`. Only after confirming continuous progress of the current stream into the metadata tail does `observeDeadlineTail` accept two fresh successful idle samples without position/duration as completion evidence. A fallback zero is still not a real position reset; query failures, foreign durations, and buffering while playing retain bounded grace.
- Done right: `player_transition` covers idle 0/2/3, seek/speed, single misreports, repeated cache, query failures, resumed progress, and foreign durations. `player_failures` uses the logged 593/651-second durations and asserts actual next URLs, natural completion of two successive episodes, failure markers, TTS, and subsequent timers. All 16 new completion scenarios failed for delayed transitions against an isolated old implementation; all 840 tests pass with the fix. Real-speaker listening was not run; simulated clocks do not prove seamless audio.
- Duration boundary: this log shows 651 seconds in metadata and 723.289 seconds for the device stream, while position still advances to 732 seconds. Neither duration alone proves completion or justifies writing device duration into song metadata. Actual source differences still require the real device/original audio to verify.
- Seen 1× (2026-10-13). Status: lesson; existing regression requirements remain in the transition matrix in [AGENTS.en.md](AGENTS.en.md).
