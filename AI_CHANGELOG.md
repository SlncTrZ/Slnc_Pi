# AI Changelog

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
