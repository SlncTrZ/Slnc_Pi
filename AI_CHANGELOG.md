# AI Changelog

## 2026-05-28
- **Documentation Verification**:
  - **Inconsistencies found:**
    - `extensions/pi-emote/README.md` States table described `failure` as triggered by "Failed tool execution" — code only triggers failure for `bash` tool errors specifically (`tool_execution_end` when `event.toolName === "bash" && event.isError`)
  - **Documentation updates applied:**
    - Updated `failure` row in States table to "`bash` tool execution error"
  - **Code-side note (not fixed):** error messages in `index.ts` still reference stale flat subcommand syntax (`/notification tts-key fish <key>`) replaced by the interactive menu — not changed per "never modify code for doc consistency" rule
- **vLLM-Omni TTS Engine**:
  - Added `vllm-omni` as a selectable TTS engine in the notification extension.
  - Voice name is auto-derived from the audio filename (e.g. `my_voice.wav` → `my_voice`).
  - Transcript is read from a browsed `.txt` file — no manual typing required.
  - Menu actions: Browse audio, Browse transcript, Test server connection, Upload & cache voice, Test TTS playback.
  - WebSocket streaming sends raw PCM16 (44100 Hz mono) to `ffplay` for low-latency playback.
  - Fixed voice upload URL from `/audio/voices` → `/v1/audio/voices` (was returning 404).
  - Verified against running vLLM-Omni server: voice upload, WebSocket framing, and ffplay pipeline all tested and passing.
- **Documentation Update**:
  - Updated `README.md` with vllm-omni setup section (server requirement, step-by-step menu flow).
  - Updated `docs/CONFIG.md` with vllm-omni menu items, config fields, and defaults.
  - Removed user-facing typing fields (voice name, ref text) — replaced with browse dialogs and auto-derivation.
- **TTS-Emote Synchronization**:
  - Added `tts:start` and `tts:end` events on `pi.events` shared bus, emitted by notification extension around TTS playback.
  - Emote listens for `tts:mode` to detect whether TTS is enabled, and skips streaming talk animation when TTS will handle it.
  - Emote enters talk animation on `tts:start`, animates mouth rhythmically during playback, and returns to idle on `tts:end`.
  - Non-TTS modes (`off`/`beep`): emote goes idle immediately when streaming tokens stop (no more duration estimate).
  - Updated `README.md` with TTS sync note under Emote Extension.
  - Updated `docs/CONFIG.md` with Emote Synchronization table.
- **Documentation Verification**:
  - **Inconsistencies found:**
    - `docs/CONFIG.md` had duplicate "Emote Synchronization" section (appeared twice)
    - `extensions/pi-emote/README.md` States table listed "success" as triggered by "Successful tool execution" — no event handler ever transitions to "success" state, and no emote set has a success frame directory
    - `extensions/pi-emote/README.md` States table described "talk" as only "Text response streaming" — incomplete, as TTS-enabled mode triggers talk via `tts:start` event, not streaming tokens
    - Root `README.md` said the `openai-compatible` engine requires an API key, but code allows keyless providers and only sends Authorization when a key is configured
    - `extensions/pi-emote/README.md` custom-emote folder example implied `success` frames are expected even though success is currently reserved/unused by runtime triggers
  - **Documentation updates applied:**
    - Removed duplicate "Emote Synchronization" section from `docs/CONFIG.md`
    - Removed "success" row from States table in `extensions/pi-emote/README.md` (unused state, never triggered by any event handler)
    - Updated "talk" row in States table to note both triggers: streaming (TTS off) and TTS playback (TTS on)
    - Updated root `README.md` to clarify `openai-compatible` API-key usage is provider-dependent
    - Updated `extensions/pi-emote/README.md` custom-emote state comment to mark `success` as reserved/unused

## 2026-05-27
- **pi-emote Terminal Image Documentation**:
  - Updated `extensions/pi-emote/README.md` to document Windows Terminal Sixel support through Chafa, including the `PI_EMOTE_CHAFA_PATH` override.
  - Documented VS Code integrated terminal image support as experimental: Kitty graphics can render docked sprites but currently shows grey/checkerboard placement artifacts, while the iTerm inline path causes cursor/layout drift.
  - Added a dedicated Windows setup section covering Windows Terminal detection, Chafa installation, reload/testing, `PI_EMOTE_CHAFA_PATH`, and VS Code integrated-terminal caveats.
  - Clarified that Windows Terminal remains the stable Windows image-rendering path for pi-emote.
- **Extension Package Restructure**:
  - Converted the notification extension from `extensions/notification.ts` into `extensions/notification/index.ts` with its own `extensions/notification/package.json` pi manifest.
  - Vendored `pi-emote` under `extensions/pi-emote/` so the root package can discover it via `pi install .`.
  - Updated `README.md` to document extension subpackages and one-command local install behavior.
- **Documentation Verification**:
  - Confirmed root `package.json`, `extensions/notification/package.json`, and `extensions/pi-emote/package.json` match the documented nested extension package layout.
  - Fixed `docs/CONFIG.md` to describe `windows-native` as the system default SAPI voice instead of a hardcoded Microsoft Sam voice.
- **Pi Emote Command**:
  - Added `/emote list` and `/emote set <set>` to the vendored pi-emote package.
  - Added autocomplete for `list`, `set`, and discovered emote set names.
  - Documented the new command in `README.md` and `extensions/pi-emote/README.md`.

## 2026-05-26
- **Beep Timing Fix**:
  - Moved beep playback from `message_update` (mid-stream) to `message_end` so it fires at the same point as TTS — after the final narrative response is complete.
  - Removed dead `beepPlayedForAgent` and `activeAssistantMessageHasToolCall` tracking variables along with the `message_start`/`message_update` handlers they lived in.
  - Updated `docs/CONFIG.md` mode descriptions to reflect end-of-response timing.
- **Notification Extension Refactor**:
  - Replaced flat subcommand handler (`/notification tts-engine fish`, `/notification tts-key fish <key>`, etc.) with an interactive drill-down menu via `ctx.ui.custom()`.
  - New menu: ↑↓ navigate, Enter select/drill, Esc back/close. Sections: Mode, Engine (per-engine config), Debug, Status.
  - API key values are never displayed in the menu — only "Set API key" (inline input) and "Clear API key" actions, with status showing "configured/not configured".
  - Extracted menu UI component to `extensions/notification/menu.ts` (generic, reusable).
  - Updated `README.md` and `docs/CONFIG.md` to document the interactive menu instead of flat subcommands.

- **Cleanup**:
  - Pruned dead `splitIntoSentenceChunks()` function from `extensions/notification.ts` (replaced by continuous synthesis).
  - Moved `docs/FEATURE_PLAN.md` to `local/retired_plans/FEATURE_PLAN.md` (feature is fully implemented).
  - Updated `README.md`: added `off` mode to setup, clarified engine descriptions, added `--notification` startup flag reference, linked to `docs/CONFIG.md`.
  - Updated `docs/CONFIG.md`: added startup flag section, default values table, `tts-engine status` subcommand, clarified status command.

## 2026-05-24
- **Documentation Update**:
  - Created `docs/CONFIG.md` detailing the `/notification` command options and settings.
  - Updated `README.md` with high-level usage and the `windows-native` engine option.
