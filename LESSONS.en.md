# MIoT Plugin Development Lessons

## Scope and Sources

Record device state, playback/transitions, voice/hourly recovery, and frontend behavior in songloft-org/songloft-plugin-miot. See the [local AI workflow](docs/en/ai-development.md) and parent host constraints. Existing AGENTS/business references remain authoritative; link evidence rather than duplicating incident histories.

## Recording and Promotion

Include rule, scope, full owner/repo#number, failure/fix commit SHAs, actual validation, and Done right examples (pending if unavailable). Seen counts independent events on distinct dates, not repeated reviews. Three dates make promotion candidates; mark the authoritative destination. Existing hard rules/serious failures apply immediately. Synchronize the [Chinese version](LESSONS.md), never invent counts/resolution/device acceptance, and redact sensitive information.

## Entries

### MIOT-001: Distinguish successful idle samples from query failures when tail progress disappears

- Scope: automatic transitions on devices whose stream duration differs from song metadata.
- Failure: [latest feedback on songloft-org/songloft#495](https://github.com/songloft-org/songloft/issues/495#issuecomment-6144580047), 2026-10-13. The earlier fix [4aeadc5](https://github.com/songloft-org/songloft-plugin-miot/commit/4aeadc559a04c5ddf329277425e4df3660d17f8a) protected continuously advancing playback, but the device removed `play_song_detail` at natural completion. Successful idle responses were treated as missing progress alone. Logs repeatedly reported `status=0, hasPosition=false, duration=0` from 19:28:01 to 19:28:25; transition waited for grace expiry, leaving silence.
- Fix: uncommitted worktree based on `587b77f000d7af4b022229b293bc519b3a957851`. Only after confirming continuous progress of the current stream into the metadata tail does `observeDeadlineTail` accept two fresh successful idle samples without position/duration as completion evidence. A fallback zero is still not a real position reset; query failures, foreign durations, and buffering while playing retain bounded grace.
- Done right: `player_transition` covers idle 0/2/3, seek/speed, single misreports, repeated cache, query failures, resumed progress, and foreign durations. `player_failures` uses the logged 593/651-second durations and asserts actual next URLs, natural completion of two successive episodes, failure markers, TTS, and subsequent timers. All 16 new completion scenarios failed for delayed transitions against an isolated old implementation; all 840 tests pass with the fix. Real-speaker listening was not run; simulated clocks do not prove seamless audio.
- Duration boundary: this log shows 651 seconds in metadata and 723.289 seconds for the device stream, while position still advances to 732 seconds. Neither duration alone proves completion or justifies writing device duration into song metadata. Actual source differences still require the real device/original audio to verify.
- Seen 1× (2026-10-13). Status: lesson; existing regression requirements remain in the transition matrix in [AGENTS.en.md](AGENTS.en.md).
