# AI Chat and Internal Architecture

miot remains a single installable plugin. Music commands and AI chat have independent switches. Existing AI command analysis, song memory, search, schedules, and DLNA remain available.

## Getting Started

Configure the provider, API URL, key, and default model in **Settings → AI Settings → Default model connection**. Enable **AI command analysis** and **AI chat** separately on the same page. Chat can reuse the default connection or use independent credentials, a model override, and its own timeout. Reusing the connection does not require enabling command analysis; an empty chat model uses the default model. Existing configuration keys are preserved. Voice settings retain monitoring, rules, music-command memory, and search, with a shortcut to AI settings. Spoken chat requires conversation monitoring; disable speech to test questions on the page without pausing music.

The default Chinese prefixes are “请问” and “问一下”. A successful answer opens a 60-second follow-up window; follow-ups still require waking the speaker. Fixed music controls take priority. Music rules, song memory, and AI command analysis handle recognized music requests; playback failures do not turn them into chat. Optionally enable fallback chat for unmatched music commands. Otherwise, questions outside the window continue to use the speaker's native assistant.

When enabled AI command analysis returns no result after a timeout, network failure, or response parsing failure, the speaker says “暂时没能识别这条指令，请再说一次” (unable to recognize this command; please try again). Unmatched-message smart resume remains available. If fallback chat, a valid follow-up window, or an ongoing answer will handle the message, it goes directly to chat without this extra hint. Requests cancelled by newer actions cannot speak late.

External song searches first collapse consecutive whitespace in the keyword and title/artist hints to single spaces. Only an explicit miss (successful HTTP response with business `code=404` or `code=0,data=null`) triggers one retry with whitespace removed. A first-attempt hit retains English word boundaries. Both attempts share the source's configured timeout and preserve source priority; network, authentication, and server errors do not trigger this retry.

“停止回答”, “退出对话”, and “结束对话” cancel the answer and close the window, optionally restoring music after a safe stop. “停止播放” keeps music stopped. New questions invalidate old tasks so late model responses cannot speak.

## Speech and Music Recovery

Model SSE incrementally updates the current answer on the page, with status pushes throttled to at most once per 200 ms. Native speaker TTS always waits for the complete model answer. Answers are split at sentence boundaries into segments of up to 200 characters, with at most 1,200 characters spoken. Full answers remain in history. Model reasoning content is not spoken.

Waiting feedback is enabled by default. After suspending music and interrupting the native answer, only the requesting speaker says “收到，正在思考” (received, thinking). The hint runs alongside the model request, with a three-second startup guard before the answer is spoken. Hint failures are logged without failing the model answer. Disable it in AI settings; text-only tests send no hint. Known hybrid thinking models on official DashScope endpoints share the command analyzer's non-thinking parameter. Other providers and thinking-only models retain their parameters. Network, model, and context still affect response time.

Once a page question is accepted, the page confirms submission and shows processing progress. History-refresh failures appear as separate warnings rather than submission failures; actual model and speech failures retain their task errors.

After group/DLNA validation, position capture, and acquisition of an interaction lease, model requests overlap native-answer stop commands. Both waiting feedback and answer TTS wait until takeover has finished. Task logs record model start, first content, takeover completion, and speech dispatch times. With AI chat enabled, idle conversation-poll backoff is capped at the greater of the user interval and two seconds; otherwise the five-second cap and failure backoff remain unchanged. Cloud conversation availability is outside plugin control.

Chat suspends automatic track advancement and captures the original position and playback revision. Group playback pauses all members, speaks only on the requesting device, and then restores the shared queue at its common position. Offline members generate individual warnings. Previously paused or stopped music is not automatically started. A text-only test replacing spoken chat first stops the old answer and follows that task's music-recovery setting.

TTS acknowledgement only confirms command acceptance. Each segment has a startup protection interval and requires two fresh idle samples with different timestamps to confirm completion. Unknown state or a 90-second segment deadline stops further segments and leaves music paused for manual recovery. Firmware-dependent speech status still requires real-device validation.

Web playback, pause, stop, scheduled playback, sleep-timer expiry, group changes, and DLNA takeover invalidate previous recovery tasks. Volume changes do not cancel chat. Stop active DLNA casting before starting spoken chat.

## History and Long-Term Memory

Chat data is isolated by account and device, uses independent versioned plugin-storage keys, and remains separate from song memory. New configurations reference the latest three successful turns, with summaries and preference memory off. Existing configurations retain their turn count, memory switch, and summary behavior on upgrade. Defaults keep at most 500 historical turns and 30 days of records, with the existing 12,000-character reference budget. Saving history does not automatically send it to the model. The follow-up window controls voice routing, not context scope, and does not survive restart.

Turning off “Include conversation history” sets `context_turns=0`: no old turns or summary are sent, and no summary is generated. When enabled, select 1–24 turns; a turn is one question and answer. Advanced “Keep a summary of earlier conversations” independently allows older references and a summary job after eight new turns (up to 2,000 characters). Summary generation makes additional model requests and pauses while conversation history is off.

“Remember my preferences” independently controls extraction and use of explicit facts/preferences, also making additional model requests. Limits are 100 entries per device, 300 characters each, and five relevant references without a vector database. With both context sources off, only the role prompt and current question are sent. Turning options off keeps local data; deletion uses separate cleanup actions. Automatic extraction never overwrites manual edits. Checkpointed extraction avoids recreating deleted preferences from processed turns. Configuration generations and storage revisions invalidate late background results.

Cancelled and failed tasks remain available for diagnostics but are excluded from successful conversation context. Deleting a turn removes automatically extracted memories from that source and rebuilds the summary; manually maintained memories remain. Resetting a session only changes its context boundary and clears its summary. Clearing history, long-term memory, or all data are separate operations. Storage revision checks reject late writes after deletion or clearing. Corrupt data is never overwritten with defaults.

## API

All paths below are relative to `/api/v1/jsplugin/miot` and require a host JWT. Device operations require `account_id` and `device_id` for a managed device. New endpoints return direct JSON; errors use `{error, detail}`. Existing endpoint responses remain compatible.

| Method and path | Purpose |
|---|---|
| `GET/PUT /chat/config` | Read or partially update chat configuration; disabled by default |
| `GET /chat/capabilities` | Report incremental HTTP availability (`streaming`) |
| `GET /chat/models` | List models using the effective chat connection |
| `POST /chat/messages` | `{account_id, device_id, text, speak?}`; returns 202 `{task_id, phase}`; questions limited to 2,000 characters |
| `GET /chat/status` | Device query parameters; returns task phase, follow-up window, and latest answer |
| `GET /chat/history` | Device parameters plus `offset` and `limit`; returns history, total, and summary |
| `DELETE /chat/history/{id}` | Delete a turn and its automatic memory sources |
| `POST /chat/cancel` | Device parameters and optional `close_session`, `resume_music`; defaults to closing the session without resuming music |
| `POST /chat/reset` | Reset session context |
| `GET/POST /chat/memories` | List memories or manually add one with `content` |
| `PUT/DELETE /chat/memories/{id}` | Edit or delete a memory |
| `POST /chat/clear` | Device parameters and `range: history/memory/all` |
| `WS /chat/ws` | Device query parameters; initial snapshot plus task, answer, and data-revision updates |

The chat connection can reuse analysis credentials or remain independent. Chat, summaries, and extraction use the chat connection. Chat defaults to a 30-second timeout, configurable from 1–30 seconds; analysis retains its existing six-second default. Shared scheduling permits two foreground requests and one low-priority background request, with one foreground model request per device. New hosts default to incremental receiving; older hosts use complete responses with a capability message on the page. Disable advanced “Show answers as they arrive” for model endpoints without SSE. Complete JSON returned by a streaming request is handled within that same request, with no automatic retry or duplicate question. Stop, new questions, and plugin shutdown cancel active streaming HTTP. Ordinary HTTP on older hosts or with incremental receiving off may continue to the host deadline. Stream failures/cancellations preserve partial text and actual status, excluded from successful context. Third-party TTS is a separate future plan; this change does not add early native-TTS speech.

## Module Boundaries and Validation

Conversation monitoring only receives and submits messages. `VoiceDispatcher` routes them; `MusicCommandService` handles music rules and AI analysis, while `VoiceEngine` remains a compatibility export. `PlaybackCoordinator` owns interaction leases, recovery, and takeover. `VoiceResumeCoordinator` manages existing native-assistant recovery per device. `SleepTimerService` unifies web, voice, and scheduled stop timers. `AIChatService`, `SpeechService`, and `ChatMemoryService` handle chat, speech, and memory respectively.

Validate in the plugin directory with `npx tsc --noEmit` and `node --experimental-strip-types --test tests/*.test.mjs`. In the frontend directory run `npm run typecheck && npm run build && npm test`. Run `songloft-plugin build`, then plugin validation in the build directory. Actual speech, interruption, and group recovery additionally require real-speaker testing.

See [AI chat testing](ai-chat-testing.md) for the coverage matrix and real-device acceptance checks.
