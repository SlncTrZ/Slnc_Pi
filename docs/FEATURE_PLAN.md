# Temporary Feature Plan: Notification Extension

> Temporary AI coordination artifact only.
>
> This file is for coordination between AI agents while this feature work is in progress. It must not be treated as durable project documentation, cited as a canonical reference, or used as a source for other docs. Only the user may decide when this file can be retired or removed.

## Feature Summary

Add notification behavior for pi model responses. The feature is expected to be exposed through a `/notification` slash command with persistent app-level settings.

Notification modes:

1. `off` — no audio notification. This is the default mode on first install/startup.
2. `beep` — play a bundled 1000 Hz / 0.5 second beep.
3. `tts` — read the assistant response aloud.
4. `both` — play the bundled beep, then read the assistant response aloud.

The implementation may be split into focused helpers internally, but user-facing control should be through a single notification command/config surface.

## Relevant Documentation And Files

- `README.md` — documents local install/remove and current package structure.
- `docs/AUTHOR_NOTES.md` — documentation guidance; temporary plans must not become durable docs.
- `docs/CODE_STANDARDS.md` — baseline extension/package standards.
- `package.json` — declares pi package resources through `pi.extensions`, `pi.skills`, and `pi.prompts`.
- `extensions/` — currently empty except for `.gitkeep`; ready for the notification extension.
- `docs/ARCHITECTURE.md` — not present yet.

## Current Understanding Of Existing Behavior

- This repository is a local installable pi package named `pi-extensions`.
- Pi auto-discovers extension files from `extensions/` because `package.json` declares `"extensions": ["./extensions"]`.
- There are currently no active extension files in `extensions/`.
- No response notification behavior exists yet.

## Clarified Requirements And Constraints

- Provide a `/notification` slash command for configuration.
- Support four modes: `off`, `beep`, `tts`, and `both`.
- Default mode is `off`.
- Store notification mode as a persistent app setting across pi sessions/restarts.
- Support flags/configuration; exact flag names are not important.
- Run only in interactive mode by default; do not beep/TTS in print, JSON, or RPC automation flows.
- TTS should read only the final narrative assistant response after all tool use is done.
- TTS should skip code blocks and markdown formatting/noise.
- There should be no fixed maximum TTS length in the initial requirements.
- Desired TTS behavior is sentence-chunk processing as the final narrative response arrives, rather than waiting for the full response to finish.
- Desired beep behavior is before final narrative text streams, not after completion.
- Failures should be documented/visible every time they occur, not silently ignored and not once-per-session suppressed.
- Use a bundled 1 kHz / 0.5 second `.wav` asset for beep playback to avoid runtime tone generation issues.

## Proposed Extension Shape

Likely primary file: `extensions/notification.ts`

Possible support files/assets:

- `extensions/notification/beep.wav` — bundled 1000 Hz / 0.5 second beep asset.
- `extensions/notification/audio.ts` — optional helper for beep/TTS process spawning if implementation grows.
- `extensions/notification/markdown.ts` — optional helper for stripping code blocks and markdown if implementation grows.
- `extensions/notification/settings.ts` — optional helper for persistent app-setting read/write if implementation grows.

Expected behavior:

- Register `/notification` command.
- Register flags for initial mode/defaults if pi flags are suitable for this use case.
- Persist current notification mode as an app-level setting.
- Hook pi response lifecycle events.
- For `off` mode:
  - do nothing.
- For `beep` mode:
  - play one bundled beep before/as the final narrative response starts streaming.
- For `tts` mode:
  - process the final narrative response only;
  - detect sentence boundaries;
  - strip code blocks and markdown-like formatting from spoken content;
  - enqueue sentence chunks to local TTS.
- For `both` mode:
  - play bundled beep before/as final narrative response starts streaming;
  - then TTS sentence chunks as they become available.
- On failure:
  - notify/log the issue every time so the user can tell what failed.

## High-Level Implementation Approach And Code Trace

### Startup / Command Flow

1. Pi starts and loads package resources from `package.json`.
2. Pi loads `extensions/notification.ts`.
3. Extension default export runs:
   - reads persistent notification setting, defaulting to `off` when missing;
   - optionally registers pi flags for startup override/configuration;
   - registers `pi.registerCommand("notification", { ... })` for runtime control;
   - registers event hooks for response lifecycle handling.
4. User can run examples such as:
   - `/notification status`
   - `/notification off`
   - `/notification beep`
   - `/notification tts`
   - `/notification both`
5. Command handler updates in-memory mode and persistent app setting.

### Beep Flow

1. User sends prompt in interactive mode.
2. Pi starts agent loop.
3. Model may produce intermediate assistant turns and tool calls.
4. Extension ignores intermediate/tool-use assistant turns.
5. Final narrative assistant response begins.
6. Notification extension detects the first final narrative text stream for the response.
7. If mode is `beep` or `both`, it plays one bundled `beep.wav` before text streams or as close to first final text as pi events allow.
8. If beep playback fails, notify/log the failure every time.

### TTS Flow

1. User sends prompt in interactive mode.
2. Pi starts agent loop.
3. Model may produce intermediate assistant turns and tool calls.
4. Extension waits for the final narrative assistant response after all tool use is complete.
5. As final narrative text streams, notification extension receives assistant `message_update` events.
6. If mode is `tts` or `both`, it processes newly arrived final-response text:
   - remove fenced code blocks and likely markdown formatting;
   - buffer text until sentence boundaries are found;
   - enqueue completed sentence chunks to TTS.
7. TTS worker reads queued chunks aloud using local TTS.
8. At final assistant/agent completion, remaining buffered non-code text is flushed to TTS.
9. If TTS playback fails, notify/log the failure every time.

## Open Questions And Decisions

Resolved decisions:

1. Default startup mode: `off`.
2. Explicit `/notification off`: yes.
3. Persistence: yes, store as persistent app-level setting across sessions/restarts.
4. Flag naming: no strong preference.
5. Mode behavior: interactive mode only by default.
6. TTS scope: only final narrative response after all tool use is done.
7. Beep backend: bundled `beep.wav`.
8. Failure reporting: notify/log every failure.

Remaining implementation questions:

1. What persistent settings API or storage path should the extension use? Options to inspect/choose during implementation:
   - pi-provided settings API if available;
   - an extension-owned JSON file under `~/.pi/agent/`;
   - session entries are not suitable because the setting must persist app-wide, not just per session.
2. What Windows command should play the bundled `.wav` reliably?
3. What Windows/local TTS command should be used for chunked speech?
4. How reliably can pi extension events identify “final narrative response after all tool use” before the text starts streaming? If event semantics do not expose this perfectly, implementation may need the closest safe approximation.
5. No startup stub extension remains; `extensions/hello.ts` has already been removed, so no cleanup is needed for it.

## Validation Strategy

- Install local package with `pi install ./pi-extensions` from the parent directory, or use the already-installed local path if present.
- Start pi and verify extension load with `/reload`.
- Run `/notification status` and confirm default mode is `off` on first run.
- Run `/notification beep`; restart/reload pi; confirm mode persists.
- Send a short prompt that requires no tool calls; confirm one bundled beep happens before/as final text starts.
- Run `/notification tts`; send a short prompt; confirm final narrative sentence chunks are spoken and markdown/code blocks are skipped.
- Run `/notification both`; send a short prompt; confirm beep then streaming TTS.
- Send a prompt that requires tool use; confirm intermediate/tool-use turns are not spoken and only final narrative text is spoken.
- Test a response containing fenced code and verify code is not spoken.
- Test failure behavior by temporarily disabling or altering the audio/TTS backend and confirming the issue is documented/notified every time without crashing pi.
- Test print mode (`pi -p`) and confirm no audio occurs.

## Next Actions

- Inspect pi extension APIs/examples for persistent app settings, interactive-mode detection, assistant streaming event semantics, command autocomplete, and local asset path handling.
- After explicit implementation approval, add the notification extension and bundled beep asset.
- Run or provide local smoke-check steps.
