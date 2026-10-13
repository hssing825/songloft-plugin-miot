# MIoT Plugin AI Development

## Execution and Authorization

Investigate, implement, validate, self-review, and deliver continuously after task assignment without separate stage approvals. Check worktrees, local AGENTS, applicable LESSONS, and business references; preserve user edits. Ask for essential missing information, product decisions, or scope expansion. Do not repeat existing authorization requests. Commits, pushes, formal releases, and Issue writes each need explicit authorization. Commit directly to main, children before parent pointers.

Shared mechanics are in the [parent AI workflow](https://github.com/songloft-org/songloft/blob/main/docs/en/ai-development.md). Synchronize the Chinese version; local business, device, and validation requirements take precedence.

## Linked Issue Replies

After pushing a fix, proactively show the complete reply draft, full target `owner/repo#number`, and comment action awaiting approval, including parent Issues. Wait for confirmation when no applicable comment authorization exists; otherwise post directly without asking again. Confirmation applies only to the specific action shown; commit/push/release approval does not automatically include comments or closure. Continue other authorized work. Review current comments before posting, read the posted body back, and deliver its link. See the complete [parent rules for linked Issue replies](https://github.com/songloft-org/songloft/blob/main/docs/en/ai-development.md#linked-issue-replies).

Plugin replies distinguish pushed fixes, specific published versions containing them, and device acceptance. Update drafts as CI/release results change and state tests, Not run checks, remaining concerns, and user next steps. Retain acceptance limits when listening was not tested; prepare replies without waiting for the user to ask, and do not close Issues on your own.

## Validation and Evidence

For source changes run `npx tsc --noEmit`, `node --experimental-strip-types --test tests/*.test.mjs`, `npm run build`, and `npm run validate`. Frontend changes also run its `npm run typecheck && npm run build && npm test`; host changes need corresponding parent Go regressions. Follow AGENTS' device matrix: with/without progress, Music API/direct URL, voice/hourly, seek/speed, and natural next track. Assert actual URLs, progress sources, failure markers, TTS, and timers rather than callback counts or UI alone. Documentation-only edits need no mechanical rebuild.

Record repository, full Issue references, baseline/final SHA or uncommitted fingerprint, environment, time, commands, observed outcomes, logs/screenshots, and relevant Not run checks. Bug tests must fail for the intended behavior against isolated old code; use deliberate break checks where useful. Changes to code/dependencies/generated output require affected checks again. Follow required CI for the same pushed SHA; cancelled/skipped does not pass.

Plugin/backend upgrade independently. Record device/firmware, audio source, plugin/backend versions, and installed commits. Cloud acknowledgment does not establish audible playback; simulated progress is not a device sample. Mark real-speaker/problem-audio checks Not run when unavailable, retaining the historical regression matrix.

## Issue Triage

Unresolved Issue triage covers the parent and all recursive submodules, deduplicated and fully paginated, retaining assignees rather than only checking this repository. From the parent run `node scripts/ai-review-context.mjs issues --output /tmp/songloft-issues-<unique-id>.json`. Standalone checkouts obtain the parent's .gitmodules inventory and complete coverage using read-only GitHub APIs.

Read bodies, all comments, fix/recurrence evidence, and remote default-branch SHAs. Report unresolved/partly fixed/fixed but open/awaiting information/unverified, next steps, and gaps. Distinguish child fix, parent pointer, publication, and installation. Open status does not prove an unfixed bug; access failure is not zero Issues. Use full `owner/repo#number`, including `songloft-org/songloft#number` for parent references.

## Retrospectives

Write evidence-backed task lessons to local Chinese/English LESSONS. Windowed reviews use the parent's ai-review-context.mjs commits for all local histories, explicitly stating remote freshness and gaps. Verify rework, changes that should not have landed, and missing validation; leave unsupported inferences unverified.

Include scope, rule, failure/fix commits, successful example, and Seen dates. Re-reviewing one incident does not increase counts; three independent events on distinct dates make promotion candidates. Mark the authoritative destination and add useful test gates. Existing rules apply immediately and serious failures need not wait three times; lessons cannot expand authorization or reverse product decisions.
