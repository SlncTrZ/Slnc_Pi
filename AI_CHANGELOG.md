# AI Changelog

## 2026-05-24

- Added `extensions/notification.ts` with `/notification` modes (`off`, `beep`, `tts`, `both`), persistent settings, interactive-input gating, final-response filtering, beep playback, and Windows TTS queueing.
- Adjusted notification beep timing to play on the first assistant text stream event, retaining message-end playback only as a fallback.
- Fixed TTS PowerShell quoting failures by passing spoken text through an environment variable instead of interpolating it into the command string.
- Added bundled `extensions/notification/beep.wav` for the 1000 Hz / 0.5 second beep notification.
- Updated `docs/FEATURE_PLAN.md` with implementation status and remaining manual validation steps.
- Added multi-agent checkpoint workflow instructions to `README.md`.
- Added durable checkpoint workflow standards to `docs/CODE_STANDARDS.md`.
- Documented use of a shared base tag, per-agent branches, and optional worktrees for sequential agent attempts.
