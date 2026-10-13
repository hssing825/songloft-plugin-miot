# AGENTS.md

This is the development entry point for `songloft-org/songloft-plugin-miot`, covering speaker-plugin implementation conventions, device compatibility, and historical regressions. See [AGENTS.md](AGENTS.md) for Chinese.

## Repository boundaries and entry points

- This is a separate Git repository, located at `plugins/src/songloft-plugin-miot/` in the parent workspace. Commit to this repository's `main`.
- Maintain plugin business and troubleshooting knowledge here. Shared host capabilities, the Go backend, and cross-repository conventions belong in the [parent AGENTS.md](https://github.com/songloft-org/songloft/blob/main/AGENTS.en.md).
- `src/player/manager.ts` owns playback state, automatic transitions, and grouped targets; `src/handlers/playlist.ts` merges HTTP/WS status; `src/playback/voice_resume.ts` restores playback after voice interruptions; `src/mina/client.ts` handles cloud device requests, shared samples, and backoff.
- `frontend/` is a Vue + TypeScript interface built into `static/`. `plugin.json` defines the manifest; the final `dist/miot.jsplugin.zip` includes QuickJS bytecode.
- Keep this file and `AGENTS.md` synchronized in content and structure. Use Conventional Commits, prefer Chinese descriptions, and omit `Co-Authored-By`.
- Commit messages may use `#124` for local issues; parent issues require the full reference, such as `songloft-org/songloft#495`. Commit the subrepository before updating its pointer in the parent; the server and plugin upgrade independently.

## Validation commands

Run in this repository:

```bash
npx tsc --noEmit
node --experimental-strip-types --test tests/*.test.mjs
npm run build
npm run validate
```

The Node 22 type-stripping flag is required for tests that import TS directly. Building first generates dictionaries/holiday data, then builds the frontend, packages assets, and compiles QuickJS bytecode. `static/` and `dist/` are ignored build outputs. For frontend changes, also run `npm run typecheck && npm run build && npm test` in `frontend/`. Changes involving host playback APIs, Range, or timers require the related Go regressions and `make check` in the parent.

## Lessons from public host APIs

- The public object at the end of the host's `internal/jsplugin/assets/common.js` determines the available `window.SongloftPlugin` members. Use `SongloftPluginGlobal` from `@songloft/client-sdk` instead of handwritten host API types.
- `invokeHost` once existed only on `window.__SongloftInternal` (marked "plugins must not depend on this") and was absent from the public object, yet miot hand-wrote an `invokeHost?` declaration in its own `frontend/env.d.ts`. So `window.SongloftPlugin?.invokeHost?.(...)` type-checked fine and was **silently swallowed** by the optional call at runtime — the entire favorite-sync feature never sent a single byte (the root cause of the second regression in songloft-org/songloft-plugin-miot#86).
- Favorite synchronization uses the public `invokeHost('favorite', 'refresh', {songId, isFavorited})`; leave transport differences between native WebView and Web/iframe to the SDK/host.

## Plugin conventions for server playback APIs

- Volume normalization: the `volume_normalize` setting makes `URLBuilder.buildSongURL` append `normalize=1&format=mp3`. Prewarming the next track must use the same transcode parameters.
- For no-import direct links whose format is unsupported by the speaker, such as webm/opus, use the parent's `/api/v1/proxy/transcode` endpoint (`songloft-org/songloft#394`). Place the token first in the query string to avoid firmware mishandling `&`.
- A countdown started when pushing the URL includes cold download/transcode time as listening time. Plugin #61 observed first-byte waits of `dur_ms=22392/24348/22381`: the first 20-odd seconds were blank and the tail was cut early. The server uses live streams and prewarming; the plugin still needs measured device progress for calibration. Download completion is not playback completion.
- Some devices ignore pause and require stop, losing their media context. Resume with a new URL carrying `seek` (plugin #60). `playCurrent` must honor the server's three-second end guard.
- Random prewarming: in random mode `PlaylistManager.reserveNextIndex()` locks "the track that
  was prewarmed" to "the track that will actually play". `getNextIndex()` re-rolls on every call, so
  prewarming and advancing each calling it once inevitably warms the wrong track (measured 492/500 mismatches)
- Stream position: `PlaylistManager.streamSeekOffsetSec` remembers where the current
  stream starts. To the device a seek stream is "a new stream starting at 0", so the
  `play_song_detail.position` it reports is only an in-stream offset and **every consumer must
  add the offset back** (`resolvePlayerStatus` in `handlers/playlist.ts`, recovery decisions in
  `playback/voice_resume.ts`), otherwise the web progress bar drops back to 0 after resuming and
  auto-advance is delayed by a whole seek duration

## Historical regression constraints for resume and replay (songloft-org/songloft#516)

- **The same symptom can have different causes**: search all issues in both the parent and plugin
  repositories, then cross-check relevant bodies, comments, fix commits, and existing tests. Include
  parent (`songloft-org/songloft`) #171/#404/#408/#437/#449/#466/#481/#488/#490/#494/#495/#500/#503/#514/#516 and
  local #54/#60/#61/#63/#87/#88/#95/#96/#98/#103/#114/#124 at minimum. A closed issue does not
  rule out a regression. Distinguish code defects from unpublished fixes, outdated plugins, and old ffmpeg images.
- **Local clock drift alone must not trigger a URL repush**: buffering can put the speaker behind;
  status 0/2 can also be wrong (songloft-org/songloft#449). Automatic recovery identifies replay using matching media,
  advancing fresh samples, and at least one sample within the first three stream seconds that is
  significantly behind the saved position. Convert stream seconds with `position * speed + seekOffset`
  first. Unknown media identity, duplicate cache samples, and samples from before the interaction cannot prove replay.
- **A reset counter must not overwrite the saved position**: voice tasks retain the interruption
  anchor; paused/stopped readbacks cannot move it back to zero. `resetAutoNextTimer` is shared by
  HTTP/WS status fusion and smart resume, and must reject counter-reset calibration while suspended.
  Fixing only `VoiceResumeCoordinator` leaves status polling free to overwrite the position, increment
  the revision, and cancel recovery (songloft-org/songloft#171).
- **New operations win and track-transition rules stay consistent**: check task identity and playback
  revision after every await. Late results cannot restore an old track after pause, stop, next, a new
  dialogue, or DLNA takeover (songloft-org/songloft#408/songloft-org/songloft#494). Normal resume must rebuild the remaining-time timer and keep
  `transitionOffset` / speed (songloft-org/songloft#404, plugin #87/#88). Restart detection must not replace tail completion
  verification (songloft-org/songloft#481/songloft-org/songloft#495). Automatic recovery near the end uses a safe integer second before the tail
  guard, preventing seek rejection from replaying the entire track.
- **Evidence and verification**: compare request `range`, response `content_range/content_length`, and
  actual `bytes` in access logs. Neither 206 nor repeated GET proves full reloading, and downloaded bytes
  are not listening progress. Inspect complete ffmpeg `error/output`; in-app upgrades do not update
  ffmpeg inside the image (songloft-org/songloft#403). Run plugin `player_failures`, `player_status`, `player_transition`,
  `mina_status`, frontend slider/status tests, and backend playback/Range/timer tests. On Node 22 use
  `node --experimental-strip-types --test tests/*.test.mjs`; do not omit tests that import TS directly.
  Automated success only establishes covered scenarios. Record real-speaker, problem-audio, and long-running
  acceptance separately; do not claim these are complete without evidence.

## Evidence and regression matrix for track transitions (songloft-org/songloft-plugin-miot#124)

- **Separate missing progress from failed queries**: a successful response with a known status, no valid
  position reported for the current stream, and no evidence of foreign media may use the original metadata
  deadline. Keep bounded retries for `status=-1`, request timeouts, frozen progress, and mismatched stream
  durations. Fixing #124 must not remove songloft-org/songloft#495's five-second query wait or thirty-second confirmation grace.
  The fallback zero with `hasPosition=false` is not an actual reset; a valid zero with `hasPosition=true`
  also does not mean progress is unsupported. Unknown duration must not invent a completion timer.
- **Carry the progress source through every caller**: the second argument to
  `resetAutoNextTimer(position, deviceReportsProgress)` distinguishes device measurements from saved anchors
  and clock estimates. Check smart-resume timeouts, HTTP/WS status fusion during suspension, plugin reload,
  hourly-resume cancellation, and duration-only probes. Changing only `PlaylistManager` is insufficient;
  inspect `handlers/playlist.ts` and `playback/voice_resume.ts`. If smart resume received real progress before
  a query failed, retain that evidence instead of treating the missing final sample as unsupported progress.
- **Retain evidence for the current stream**: soft pause, voice suspension, resume, and timer rescheduling
  retain the fact that a valid position was observed. A new track, URL repush of the same track, new playlist,
  or disposal clears it. Record late query results only after checking playback identity/revision; an old
  sample must not contaminate a replacement stream and add another thirty seconds of waiting.
- **Reproduce interactions before fixing them**: new regression tests should fail before the fix and pass
  afterward. Assert the actual next-track URL push, queue index/state, failure markers, TTS, and remaining
  timers. Counting `onSongFinished` calls or inspecting screenshots alone does not establish queue continuity.
  Screen all issues and comments in both repositories, then cross-check relevant fix commits and the latest
  recurrence logs. Leave unconfirmed historical causes unknown; similar titles do not establish the same
  cause, and closed issues still need consideration.

| Historical issues | Behavior to preserve | Regression entry points |
|---|---|---|
| Parent #495 ↔ plugin #124 | Switch status-only devices on time; retain confirmation for missing measured progress, buffering, frozen positions, and mismatched durations | `player_transition`, `player_failures` |
| Parent #404, plugin #60/#87/#88/#95 | Resume after long pauses with remaining time, seek/speed/offset intact; counter resets must not overwrite the interruption anchor | `player_failures`, `player_status` |
| Parent #264/#437 | Keep probing unknown durations without inventing an end limit; discovering device duration restores the regular timer | `player_transition`, backend seek tests |
| Plugin #98 | A cloud acknowledgment timeout does not prove failed playback; retain false-failure verification, retry backoff, and external recovery | `player_failures`, `mina_status` |
| Parent #466/#494, plugin #114 | Failure markers expire; all failed candidates still get a retry; natural completion neither blacklists tracks nor emits single-track TTS that interrupts the next URL | `player_failures`, frontend failure-marker tests |
| Parent #408/#449, plugin #103 | Distinguish external stops from incorrect status reports using progress evidence; old tasks cannot push tracks after new controls or DLNA takeover | `player_failures`, `player_status` |
| Parent #500/#503/#514 | Share queries per device, back off on failure, prioritize controls; expired handles and late results cannot clear replacement timers | `mina_status`, `player_transition`, host timer tests |

Keep this matrix synchronized with the Chinese version. Named plugin tests use `tests/<name>.test.mjs`.
The parent server and plugin upgrade independently; acceptance records must include both versions and the commits actually installed.
