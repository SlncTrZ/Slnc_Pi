# Notification Extension

Enable audio notifications for assistant responses — beep, TTS speech, or both.

## Install

This extension is part of **[Jarod's Pi Extensions](../../README.md)** and is installed by the parent package. From the repository root:

```bash
npm install
pi install .
```

`npm install` installs this package's runtime dependencies for local path installs. Then restart pi or run `/reload` if pi is already running.

## Quick Start

Run `/notification` inside pi to open the interactive configuration menu. Navigate with ↑↓, press Enter to select or drill into submenus, and Escape to go back.

## Menu Structure

- **Mode** — Choose `off`, `beep`, `tts`, or `both`
- **Engine** — Select and configure a TTS engine:
  - `fish` — High-quality streaming TTS via Fish Audio WebSocket (requires API key)
  - `openai-compatible` — OpenAI-compatible `/v1/audio/speech` providers
  - `windows-native` — Local Windows SAPI (no key required, Windows only)
  - `vllm-omni` — Local vLLM-Omni server (S2-Pro) via WebSocket streaming PCM audio
- **TTS Output** — Configure how TTS handles output:
  - **Output Style** — `verbose` (full output, default) or `shortened` (LLM-summarized before TTS)
  - **Select summarizer model** — Pick an LLM from models available via `/model`
  - **Set skip threshold** — Responses shorter than N sentences skip summarization (default: 4)
- **Debug** — Test beep playback and TTS synthesis
- **Status** — Show current configuration summary

## TTS Summarization

When `shortened` output style is active, long responses are summarized by the configured model before TTS, making them much easier to listen to (tables, code, and verbose output are condensed to 3–5 sentences). The summary is shown below the final output as a dim custom message and is not sent to the LLM as chat context.

## vLLM-Omni Setup

Before using the `vllm-omni` engine you need a running vLLM-Omni server (e.g. S2-Pro) accessible at the configured base URL (default `http://localhost:8091`). Once the server is running:

1. Run `/notification` → Engine → `vllm-omni`
2. **Browse audio (.wav)** — pick your voice reference `.wav` file
3. **Browse transcript (.txt)** — pick the matching transcript (optional but recommended)
4. **Test server connection** — verify the server is reachable
5. **Upload & cache voice** — upload and cache the voice on the server
6. **Test TTS playback** — play a short test sentence to confirm everything works

Voice name is auto-derived from the audio filename. The transcript is read from the selected `.txt` file.

## Startup Flag

Override the notification mode at launch:

```bash
pi --notification beep   # or tts, both, off
```

## Configuration Reference

See [`docs/CONFIG.md`](../../docs/CONFIG.md) for environment variables, defaults, settings file schema, and emote synchronization details.
