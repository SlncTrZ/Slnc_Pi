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
- `extensions/` — pi package extension root; directory-based extensions should use `index.ts`.
- `docs/ARCHITECTURE.md` — not present yet.
- Pi extension docs: `docs/extensions.md` in the installed pi package documentation.
- Pi session format docs: `docs/session-format.md` in the installed pi package documentation.

## Current Understanding Of Existing Behavior

- This repository is a local installable pi package named `pi-extensions`.
- Pi auto-discovers extension files from `extensions/` because `package.json` declares `"extensions": ["./extensions"]`.
- Pi supports extension directories through `extensions/<name>/index.ts`.
- No response notification behavior exists unless a notification extension is added.
- Extension reload/install state must be verified separately from file edits; editing this repository does not prove pi is loading the edited copy.

## Clarified Requirements And Constraints

- Provide a `/notification` slash command for configuration.
- Support four modes: `off`, `beep`, `tts`, and `both`.
- Default mode is `off`.
- Store notification mode as a persistent app-level setting across pi sessions/restarts.
- Extension-owned persistent storage is acceptable. Prefer a JSON settings file under `~/.pi/agent/`, for example `~/.pi/agent/notification-settings.json`.
- Support simple diagnostic commands:
  - `/notification test-beep` — play the bundled beep immediately.
  - `/notification test-tts` — speak a short fixed test phrase immediately.
- Support `status` and `help` subcommands.
- Run only in interactive mode by default; do not beep/TTS in print, JSON, or RPC automation flows.
- TTS should read only the final narrative assistant response after all tool use is done.
- TTS should skip code blocks and markdown formatting/noise.
- There should be no fixed maximum TTS length in the initial requirements.
- Desired TTS behavior is sentence-chunk processing as the final narrative response arrives, rather than waiting for the full response to finish.
- Desired beep behavior is before final narrative text streams, not after completion.
- If pi lifecycle events cannot reliably identify the final narrative response before it starts streaming, the initial reliable implementation may run at `agent_end` and read the last narrative assistant message from the session branch. Treat earlier beep/streaming TTS as a follow-up enhancement.
- Failures should be documented/visible every time they occur, not silently ignored and not once-per-session suppressed.
- Audio/TTS process helpers should propagate failures to the command/event handler so `ctx.ui.notify(..., "error")` can report them.
- Use a bundled 1 kHz / 0.5 second `.wav` asset for beep playback to avoid runtime tone generation issues. Do not rely on runtime tone generation for the primary beep behavior.

## Pi Message And Session Shape Requirements

Future implementers should use pi's actual message/session shapes rather than guessing field names.

### Session Entries

`ctx.sessionManager.getBranch()` returns session entries. Message entries wrap the actual model/user/tool message under `entry.message`:

```ts
{
  type: "message",
  id: string,
  parentId: string | null,
  timestamp: string,
  message: {
    role: "user" | "assistant" | "toolResult" | "custom" | string,
    content: unknown,
    // assistant messages also include provider/model/usage/stopReason fields
  }
}
```

Do not look for assistant data directly on `entry.role` or `entry.content`; use `entry.message.role` and `entry.message.content`.

### Assistant Content Blocks

Assistant messages use content arrays. Important block types:

```ts
{ type: "text", text: string }
{ type: "thinking", thinking: string }
{ type: "toolCall", id: string, name: string, arguments: Record<string, unknown> }
```

When checking whether an assistant message is final narrative text, skip any assistant message that contains a `toolCall` block. Some provider/event paths may expose tool blocks under provider-specific names such as `tool_use`, but pi session format uses `toolCall`.

### Reliable Final Narrative Detection

A reliable initial strategy is:

1. Hook `agent_end`.
2. Return early unless `ctx.hasUI` and mode is not `off`.
3. Read `const branch = ctx.sessionManager.getBranch()`.
4. Walk backward through `branch`.
5. Find the first entry where:
   - `entry.type === "message"`;
   - `entry.message?.role === "assistant"`;
   - `entry.message.content` is an array;
   - content contains one or more `{ type: "text" }` blocks;
   - content contains no `{ type: "toolCall" }` blocks.
6. Join text blocks and use that as the final narrative response.
7. If no text is found, notify an error such as `Notification skipped: no final narrative assistant message found.`

This approach runs after the response finishes. It is preferred for the first reliable implementation if lifecycle events do not expose a confirmed final-narrative start signal before text streaming begins.

## Proposed Extension Shape

Recommended primary extension directory: `extensions/notification/`

Recommended files/assets:

- `extensions/notification/index.ts` — extension entrypoint; registers command and lifecycle hooks.
- `extensions/notification/beep.wav` — bundled 1000 Hz / 0.5 second beep asset.
- `extensions/notification/audio.ts` — beep/TTS process helpers.
- `extensions/notification/markdown.ts` — code-block and markdown stripping, sentence splitting.
- `extensions/notification/settings.ts` — extension-owned persistent setting read/write.

Expected behavior:

- Register `/notification` command.
- Register argument completions for `off`, `beep`, `tts`, `both`, `status`, `help`, `test-beep`, and `test-tts`.
- Persist current notification mode as an app-level extension setting.
- Hook pi response lifecycle events.
- For `off` mode:
  - do nothing.
- For `beep` mode:
  - play one bundled beep for the final narrative response.
- For `tts` mode:
  - process the final narrative response only;
  - detect sentence boundaries;
  - strip code blocks and markdown-like formatting from spoken content;
  - enqueue or sequentially process sentence chunks to local TTS.
- For `both` mode:
  - play bundled beep;
  - then speak sentence chunks.
- On failure:
  - notify/log the issue every time so the user can tell what failed.

## High-Level Implementation Approach And Code Trace

### Startup / Command Flow

1. Pi starts and loads package resources from `package.json`.
2. Pi loads `extensions/notification/index.ts`.
3. Extension default export runs:
   - reads persistent notification setting, defaulting to `off` when missing;
   - registers `pi.registerCommand("notification", { ... })` for runtime control;
   - registers event hooks for response lifecycle handling.
4. User can run examples such as:
   - `/notification status`
   - `/notification off`
   - `/notification beep`
   - `/notification tts`
   - `/notification both`
   - `/notification test-beep`
   - `/notification test-tts`
5. Command handler updates in-memory mode and persistent app setting.
6. Test commands execute audio/TTS immediately and report success/failure through `ctx.ui.notify`.

### Settings Flow

1. Store settings in an extension-owned JSON file under `~/.pi/agent/`.
2. On startup, read `{ "mode": "off" | "beep" | "tts" | "both" }`.
3. If the file is missing, invalid, or unreadable, use `off`.
4. When mode changes, ensure the settings directory exists and write the JSON file.
5. Do not store this as a session entry because the setting must persist app-wide, not just per session.

### Beep Flow

Reliable first implementation:

1. User sends prompt in interactive mode.
2. Pi starts and completes the agent loop.
3. Extension handles `agent_end`.
4. Extension finds the final narrative assistant message from the session branch.
5. If mode is `beep` or `both`, it plays `extensions/notification/beep.wav`.
6. If beep playback fails, notify/log the failure every time.

Desired future enhancement:

- If pi exposes a confirmed final-narrative start signal before text streams, play `beep.wav` before/as that final text starts streaming instead of at `agent_end`.

### TTS Flow

Reliable first implementation:

1. User sends prompt in interactive mode.
2. Pi starts and completes the agent loop.
3. Extension handles `agent_end`.
4. Extension finds the final narrative assistant message from the session branch.
5. If mode is `tts` or `both`, it processes that final text:
   - remove fenced code blocks and likely markdown formatting;
   - split text into sentence chunks;
   - speak chunks sequentially using local TTS.
6. If TTS playback fails, notify/log the failure every time.

Desired future enhancement:

- If pi exposes a reliable streaming signal for the final narrative message, process sentence chunks as they arrive and flush remaining text at completion.

## Audio Backend Guidance

The initial implementation should be simple and local OS-backed. Do not add cloud/API TTS yet.

### Windows

- Beep: use the bundled `.wav` with PowerShell and `System.Media.SoundPlayer`.
- TTS: use PowerShell with `SAPI.SPVoice`.
- Prefer writing a temporary `.ps1` file and executing it with:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File <temp-script.ps1>
```

This avoids fragile quoting/escaping in long inline `-Command` strings.

### macOS

- Beep: use `afplay <beep.wav>`.
- TTS: use `say <text>`.

### Linux

- Beep: use `ffplay -nodisp -autoexit <beep.wav>` when available.
- TTS: a simple first pass may use `edge-tts` piped to `ffplay`, or another local command available on the user's machine.
- If the command is missing or exits non-zero, report the failure visibly.

### Process Failure Handling

- Do not swallow child process failures.
- Capture non-zero exit codes and stderr where practical.
- Throw or return errors to the calling command/event handler.
- Surface errors using `ctx.ui.notify(message, "error")`.

## Open Questions And Decisions

Resolved decisions:

1. Default startup mode: `off`.
2. Explicit `/notification off`: yes.
3. Persistence: yes, store as persistent app-level setting across sessions/restarts.
4. Persistence location: extension-owned JSON under `~/.pi/agent/` is acceptable.
5. Flag naming: no strong preference; slash command subcommands are sufficient for the initial implementation.
6. Mode behavior: interactive mode only by default.
7. TTS scope: only final narrative response after all tool use is done.
8. Beep backend: bundled `beep.wav`.
9. Failure reporting: notify/log every failure.
10. Local TTS only for now; add API-backed TTS later.

Remaining implementation questions:

1. Can pi extension events reliably identify “final narrative response after all tool use” before the text starts streaming? If not, use the `agent_end` + `sessionManager.getBranch()` approach for the initial implementation.
2. Which Linux TTS/playback commands should be preferred for the user's environment if `ffplay` or `edge-tts` are unavailable?
3. Should future versions expose configurable TTS voice/rate/volume settings?
4. No startup stub extension remains; `extensions/hello.ts` has already been removed, so no cleanup is needed for it.

## Validation Strategy

### Install And Load Validation

- From the package directory, install/reinstall the local package:

```bash
pi install .
```

- Verify package install state:

```bash
pi list
```

- Start pi and reload resources:

```text
/reload
```

- Confirm `/notification` appears in slash command completions.

### Command Validation

- Run `/notification status` and confirm default mode is `off` on first run.
- Run `/notification beep`; restart/reload pi; confirm mode persists.
- Run `/notification tts`; restart/reload pi; confirm mode persists.
- Run `/notification both`; restart/reload pi; confirm mode persists.
- Confirm invalid modes show a visible error.

### Audio Backend Validation

- Run `/notification test-beep` and confirm the bundled beep plays through the active audio device.
- Run `/notification test-tts` and confirm the fixed test phrase is spoken through the active audio device.
- If either test command fails, treat it as an audio backend/path/process issue, not a model response lifecycle issue.
- Confirm failures show visible error notifications rather than silently succeeding.

### Response Lifecycle Validation

- Set `/notification beep`; send a short prompt that requires no tool calls; confirm one beep happens after the final response in the reliable initial implementation.
- Set `/notification tts`; send a short prompt; confirm the final narrative response is spoken.
- Set `/notification both`; send a short prompt; confirm beep then TTS.
- Send a prompt that requires tool use; confirm intermediate/tool-calling assistant turns are not spoken and only the final narrative message is spoken.
- Test a response containing fenced code and verify code blocks are not spoken.
- Test print mode (`pi -p`) and confirm no audio occurs.

### Diagnostic Split

When debugging, split failures into two categories:

1. Audio backend failure:
   - `/notification test-beep` or `/notification test-tts` fails.
   - Focus on asset paths, OS commands, active audio device, PowerShell execution policy, missing `ffplay`, or missing TTS command.
2. Lifecycle/message detection failure:
   - test commands work, but no audio plays after model responses.
   - Focus on `agent_end`, `ctx.hasUI`, mode state, package reload/install state, and final narrative extraction from `ctx.sessionManager.getBranch()`.

## Next Actions

- Implement or refine the notification extension using `extensions/notification/index.ts` and helper modules.
- Include the bundled `extensions/notification/beep.wav` asset.
- Validate `/notification test-beep` and `/notification test-tts` before validating response-driven notifications.
- Validate final narrative extraction using pi's session entry shape: `entry.message.role`, `entry.message.content`, and `toolCall` content blocks.
