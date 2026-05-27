# Temporary Feature Plan: Notification Extension

> Temporary AI coordination artifact only.
>
> This file is for coordination between AI agents while this feature work is in progress. It must not be treated as durable project documentation, cited as a canonical reference, or used as a source for other docs. Only the user may decide when this file can be retired or removed.

## Feature Summary

Add notification behavior for pi model responses. The feature is exposed through a `/notification` slash command with persistent app-level settings.

Notification modes:

1. `off` — no audio notification. This is the default mode on first install/startup.
2. `beep` — play a bundled 1000 Hz / 0.5 second beep.
3. `tts` — read the assistant response aloud.
4. `both` — play the bundled beep, then read the assistant response aloud.

TTS no longer uses system TTS. It is now routed through a configurable API-backed TTS engine.

Supported TTS engines:

1. `fish` — Fish Audio REST TTS using the `s2-pro` model.
2. `openai-compatible` — local/OpenAI-compatible `/v1/audio/speech` server.

## Relevant Documentation And Files

- `README.md` — documents local install/remove and current package structure.
- `docs/AUTHOR_NOTES.md` — documentation guidance; temporary plans must not become durable docs.
- `docs/CODE_STANDARDS.md` — baseline extension/package standards.
- `package.json` — declares pi package resources through `pi.extensions`, `pi.skills`, and `pi.prompts`.
- `extensions/notification.ts` — notification command, persistent settings, lifecycle hooks, beep playback, and configurable API TTS.
- `extensions/notification/beep.wav` — bundled beep asset.
- `docs/ARCHITECTURE.md` — not present.
- Fish Audio docs consulted at `https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech.md`.

## Current Understanding Of Existing Behavior

- This repository is a local installable pi package named `pi-extensions`.
- Pi auto-discovers extension files from `extensions/` because `package.json` declares `"extensions": ["./extensions"]`.
- The notification extension persists settings in `~/.pi/agent/notification.json`.
- The extension only runs audio behavior in interactive UI sessions.
- TTS is queued from the final narrative assistant response after markdown/code stripping.
- Fish Audio TTS uses the `/v1/tts/live` WebSocket with MessagePack events and streams PCM audio into `ffplay` to reduce synthesis/playback latency.
- OpenAI-compatible TTS still uses HTTP `/audio/speech` WAV generation/playback.

## Clarified Requirements And Constraints

- Provide a `/notification` slash command for configuration.
- Support four modes: `off`, `beep`, `tts`, and `both`.
- Default mode is `off`.
- Store notification mode and TTS engine settings as persistent app settings across pi sessions/restarts.
- TTS should not use system TTS.
- TTS should support Fish Audio `s2-pro` via their REST API.
- TTS should support OpenAI-compatible local servers, primarily not OpenAI-hosted usage.
- Fish Audio default `reference_id`: `6d370109274d4c29ab83ad6b6af77978`.
- API keys may be stored via command settings, but environment variables are preferred/supported so keys survive repo reinstall/replacement.
- Status output must indicate whether keys are configured but must never print key values.
- Use streamed PCM for Fish Audio playback and WAV responses for OpenAI-compatible HTTP playback.
- Run only in interactive mode by default; do not beep/TTS in print, JSON, or RPC automation flows.
- TTS should read only the final narrative assistant response after all tool use is done.
- TTS should skip code blocks and markdown formatting/noise.
- Failure reporting remains visible every time failures occur.

## Implemented Command Surface

Existing mode commands:

- `/notification status`
- `/notification off`
- `/notification beep`
- `/notification tts`
- `/notification both`

TTS engine/config commands:

- `/notification tts-engine status`
- `/notification tts-engine fish`
- `/notification tts-engine openai-compatible`
- `/notification tts-key fish <api-key>`
- `/notification tts-key openai-compatible <api-key>`
- `/notification clear-key fish`
- `/notification clear-key openai-compatible`
- `/notification fish-reference <reference-id>`
- `/notification openai-url <base-url>`
- `/notification openai-model <model>`
- `/notification openai-voice <voice>`
- `/notification test-tts [text]`
- `/notification test-beep`

Supported environment variables:

- Fish key: `PI_NOTIFICATION_FISH_API_KEY` or `FISH_AUDIO_API_KEY`.
- OpenAI-compatible key: `PI_NOTIFICATION_OPENAI_TTS_API_KEY` or `OPENAI_API_KEY`.

Defaults:

- TTS engine: `fish`.
- Fish model/header: `s2-pro`.
- Fish `reference_id`: `6d370109274d4c29ab83ad6b6af77978`.
- OpenAI-compatible base URL: `http://localhost:8000/v1`.
- OpenAI-compatible model: `tts-1`.
- OpenAI-compatible voice: `alloy`.

## High-Level Implementation Approach And Code Trace

### Startup / Command Flow

1. Pi starts and loads package resources from `package.json`.
2. Pi loads `extensions/notification.ts`.
3. Extension default export runs:
   - reads persistent notification settings from `~/.pi/agent/notification.json`, applying defaults when missing;
   - registers the `--notification` startup flag for mode override;
   - registers `pi.registerCommand("notification", { ... })` for runtime control;
   - registers event hooks for response lifecycle handling.
4. User controls mode and TTS settings with `/notification ...` commands.
5. Command handler updates in-memory settings and persists them to the settings file.

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
5. At final assistant message end, if mode is `tts` or `both`, the extension strips fenced code blocks and markdown formatting while preserving inline-code text such as option names.
6. The cleaned final response is queued as one continuous synthesis item to avoid sentence-by-sentence API gaps.
7. The TTS queue calls the configured engine:
   - Fish Audio: opens `wss://api.fish.audio/v1/tts/live`, sends MessagePack `start`, `text`, `flush`, and `stop` events, requests `format: "pcm"`, and streams returned audio chunks into `ffplay` as raw 44.1 kHz mono PCM.
   - OpenAI-compatible: `POST <baseUrl>/audio/speech`, optional bearer auth, JSON body with `model`, `voice`, `input`, and `response_format: "wav"`.
8. For Fish, audio playback starts as chunks arrive from the WebSocket instead of waiting for a complete generated WAV file.
9. For OpenAI-compatible HTTP, returned WAV bytes are written to a temporary file and played with the TTS WAV playback path.
10. Temporary WAV files are deleted best-effort after playback.
11. If synthesis or playback fails, notify/log the failure every time.

## Open Questions And Decisions

Resolved decisions:

1. Default startup mode: `off`.
2. Explicit `/notification off`: yes.
3. Persistence: yes, store as persistent app-level setting across sessions/restarts.
4. Mode behavior: interactive mode only by default.
5. TTS scope: final narrative response after all tool use is done.
6. Beep backend: bundled `beep.wav`.
7. Failure reporting: notify/log every failure.
8. System TTS removed: yes.
9. Configurable TTS engines: Fish Audio `s2-pro` and OpenAI-compatible local API.
10. Fish default voice/reference: `6d370109274d4c29ab83ad6b6af77978`.
11. API key display: status only says configured/not configured, never prints key values.
12. OpenAI-compatible audio output: request WAV.
13. Fish Audio output: stream PCM over WebSocket and pipe to `ffplay`.

Remaining implementation/manual-validation questions:

1. Which local OpenAI-compatible TTS server will be used for manual validation, and what model/voice names does it expect?
2. Does the target local server support `response_format: "wav"`; if not, add a configurable response format or conversion path.
3. Does Fish Audio accept the default reference ID for the user's account/API key without additional permissions?

## Validation Strategy

- Smoke checked extension loading in print mode with `pi -e ./extensions/notification.ts -p "say ok"`; output was `ok`, confirming no audio ran in print mode and the extension compiles/loads.
- Added `/notification test-tts [text]` and `/notification test-beep` for interactive diagnostics that separate API/playback issues from response-lifecycle hook issues.
- Changed final-response TTS from sentence-by-sentence synthesis to one continuous synthesis request to reduce choppy gaps.
- Changed Fish Audio TTS from blocking HTTP WAV generation to WebSocket PCM streaming through `ffplay` for lower latency.
- Changed markdown stripping to preserve inline-code text while still removing fenced code blocks.
- Manual interactive validation still needed:
  - `/notification status` confirms mode, engine, endpoint/model/voice/reference, and key configured/not configured without printing keys.
  - Set Fish key via env var or `/notification tts-key fish <key>`.
  - `/notification tts-engine fish` then `/notification tts`; send a short prompt and confirm Fish Audio WebSocket PCM streaming/playback.
  - Run `/notification fish-reference <reference-id>` and confirm persistence.
  - Start a local OpenAI-compatible TTS server.
  - Configure `/notification openai-url <base-url>`, `/notification openai-model <model>`, `/notification openai-voice <voice>`, and optional `/notification tts-key openai-compatible <key>`.
  - `/notification tts-engine openai-compatible`; send a short prompt and confirm local WAV synthesis/playback.
  - `/notification both`; confirm beep then TTS.
  - Test a response containing fenced code and verify code is not spoken.
  - Test failure behavior with missing Fish API key and confirm the issue is reported without crashing pi.

## Next Actions

- Run manual interactive Fish Audio validation with a real API key.
- Run manual interactive OpenAI-compatible validation against the intended local server.
- If the local server does not support WAV output exactly as implemented, add response-format configuration or a conversion fallback.
