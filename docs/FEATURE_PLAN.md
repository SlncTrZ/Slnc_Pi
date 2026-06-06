# Temporary Feature Plan: Voice Input Extension

> Temporary coordination artifact only.
>
> This file is for coordinating AI agents while the voice input extension is being planned and implemented. It is not durable project documentation, must not be cited as a canonical reference, and must not be used as a source for permanent docs. Only Jarod may decide when this file can be retired or removed.

## Feature Summary

Add a new Pi extension that lets Jarod speak voice input, transcribes it locally with Voxtral, fills Pi's editor with transcript text, and can submit or stop by explicit voice command.

Target model: `mistralai/Voxtral-Mini-4B-Realtime-2602`.

Primary target environment:
- Windows
- NVIDIA GPU
- Enough VRAM for Voxtral Mini Realtime, expected 16GB+
- Isolated Python runtime managed outside the repository working tree where possible

## Confirmed Requirements

- Transcript text should fill/append to the editor and should not auto-submit unless an explicit voice submit command is detected.
- Support three listening modes:
  - push-to-talk
  - toggle listening
  - always-listening with VAD
- Target Windows + NVIDIA GPU first.
- Python worker process is acceptable if isolated from Pi and non-blocking.
- Prefer `uvx` as the worker launch path instead of creating a repository `.venv` or relying on global packages.
- Keep locked development package versions in a `uv.lock` or equivalent lock artifact.
- Do not build a mock backend first.
- Do not support mid-response steering for the first version.
- Add an option to auto-launch the worker before each Pi session.
- Auto-launch must be non-blocking.
- TypeScript should own microphone capture and stream audio to the worker over a local socket.
- The worker should stream transcription results back as they arrive, and the extension should update the editor incrementally.
- Use a single `/voice` command tree for actions, modes, config, and model download.
- Add a `/voice` menu option to initiate model download.
- Prefer native Python inference first; keep vLLM as a fallback backend if native realtime performance is not fast enough.
- Keep the worker source inside `extensions/voice-input/` so the extension remains usable on other computers that install the parent package.
- Transcription should append to editor text rather than replace it.
- Explicit voice submit commands (for example `Emi send prompt` or `Okay, that's it`) should submit the editor and omit the command tail.
- Explicit voice stop commands (for example `stop listening`) should stop voice capture without submitting.
- Model downloads should use the normal Hugging Face cache.
- Always-listening mode should require a wake phrase.
- Wire voice/listening state into `pi-emote` so it can show a listening indicator/facial expression.
- Implement all three modes in the first version.

## Current Repository Context

Relevant existing patterns:

- `extensions/notification/index.ts`
  - Uses commands, flags, persisted settings, background work, Windows audio helpers, and UI notifications.
- `extensions/system-prompt/index.ts`
  - Simple settings and command/menu extension structure.
- `extensions/pi-emote/index.ts`
  - Uses session lifecycle and extension events.
- Pi extension API docs show support for:
  - `pi.registerCommand()`
  - `pi.registerShortcut()`
  - `pi.on("session_start")`
  - `ctx.ui.setStatus()`
  - `ctx.ui.setWidget()`
  - `ctx.ui.setEditorText()`
  - `pi.sendUserMessage()` for explicit voice submit commands and keyboard-submit parity in always-listening mode.

## Recommended Architecture Direction

Do not run Voxtral model inference inside the TypeScript extension process. Instead, build a Pi extension that manages a separate local Python worker process. The TypeScript side owns microphone capture and streams PCM frames to the worker over a local socket, while the Python side owns model loading and inference.

Rationale:
- Pi extensions execute in the Pi Node process; loading a 4B realtime model there is not practical.
- Node-native inference for this model would likely require fragile native bindings.
- A worker process isolates GPU/CUDA/Python failures from Pi.
- TypeScript-owned mic capture keeps the Pi UX/control plane centralized if audio capture dependencies are manageable on Windows.
- The Pi extension can still provide integrated UX by managing worker launch, commands, shortcuts, status, transcript preview, and editor insertion.

## Proposed Components

```text
extensions/voice-input/
├── package.json
├── README.md
├── index.ts             # Pi extension entrypoint
├── settings.ts          # persisted settings under Pi agent dir
├── worker-client.ts     # worker process and socket protocol client
├── audio-capture.ts     # ffmpeg microphone capture
└── menu.ts              # interactive tree menu

extensions/voice-input/worker/
├── pyproject.toml
├── uv.lock
└── voice_worker.py      # Voxtral/VAD/model inference worker
```

Worker source should live under `extensions/voice-input/worker/` so the extension is usable on other computers that install the parent package. Temporary experiments or validation scripts may still live under `local/`.

## High-Level Code Trace

### Session startup with auto-launch enabled

```text
Pi starts/reloads
  -> extensions/voice-input/index.ts default export runs
  -> load settings from ~/.pi/agent/voice-input.json
  -> register /voice command and shortcuts
  -> pi.on("session_start") fires
    -> if autoLaunchWorker is true:
      -> startWorkerNonBlocking()
        -> spawn uvx/uv command in background
        -> do not await model load on the Pi startup path
        -> set status: Voice worker starting
        -> connect when ready or show non-blocking error
```

### Push-to-talk

```text
User presses configured shortcut or runs `/voice listen` while `mode=push-to-talk`
  -> extension starts local mic capture
  -> extension streams PCM frames to worker over the local socket
  -> worker performs VAD and native Voxtral streaming/inference
  -> partial/final transcript events return over the socket
  -> extension appends/updates editor text incrementally
  -> voice submit/stop commands are handled when final text ends with a recognized command tail
```

### Toggle listening

```text
/voice toggle or shortcut
  -> if idle: tell worker to listen continuously until stopped
  -> if listening: tell worker to stop and finalize current utterance
  -> final transcript is appended into the editor
```

### Always-listening with VAD and wake phrase

```text
/voice mode always
  -> extension keeps mic capture active and streams audio frames
  -> worker performs VAD and wake-phrase detection
  -> before wake phrase: do not update editor
  -> after wake phrase: stream partial/final transcript events
  -> extension appends/updates voice text in the editor incrementally
  -> extension emits voice/listening state events for pi-emote
  -> explicit voice or keyboard submission resets always-listening mode back to the wake-phrase gate
```

## UX Commands To Consider

Everything should live under one `/voice` command tree:

- `/voice` opens a tree menu or shows status/help.
- `/voice start-worker`
- `/voice stop-worker`
- `/voice restart-worker`
- `/voice status`
- `/voice mode push-to-talk|toggle|always`
- `/voice listen`
- `/voice stop`
- `/voice health`
- `/voice devices`
- `/voice device <exact DirectShow audio device name>`
- `/voice download-model` starts/downloads model artifacts to the Hugging Face cache through the worker

Shortcut candidates based on current Pi defaults:
- `ctrl+t` is already used for thinking toggle, so avoid it by default.
- `ctrl+v` is clipboard/paste-image related, so avoid it by default.
- Initial default: `f8` for starting/stopping listening. `ctrl+shift+v` was rejected because it conflicts with paste in common terminals.

Shortcuts should be configurable in settings or via Pi keybinding configuration.

## Worker Isolation Thoughts

Preferred approach to explore:

- Use `uvx` from the extension as specified by Jarod.
- Keep a checked-in lock file for reproducible worker development dependencies.
- Avoid creating `.venv` inside the repository by default.
- Make worker command configurable for Jarod's machine if Voxtral setup requires a specialized command.
- Add a model download action through `/voice download-model`.

Resolved implementation direction: use an installable worker package under `extensions/voice-input/worker/` launched with `uvx --refresh --from <worker-dir> pi-voice-worker`, with dependencies locked in `uv.lock`.

## Open Questions

1. Whether native Transformers streaming is fast enough long term, or whether vLLM should be added as an alternate backend.
2. Whether dedicated pi-emote listening frames should be added instead of mapping voice states to existing think/talk/idle states.
3. Whether additional voice command phrases should be configured through settings rather than hard-coded patterns.

## Validation Strategy

Planned validation once implementation begins:

- TypeScript/source validation for the extension entrypoint and settings/client modules.
- Worker command smoke test from terminal on Windows with NVIDIA GPU.
- Pi extension load smoke check with `pi install .` and `/reload`.
- Manual Pi flow:
  - start worker
  - verify non-blocking status while loading
  - manual listening capture
  - partial/final transcript appears in editor
  - voice submit and voice stop command tails are handled correctly
  - stop worker cleanly
- Always-listening/VAD smoke check confirms wake-phrase gating and post-submit gate reset.

## Next Actions

- Continue tuning native Transformers streaming latency.
- Consider a vLLM backend if native streaming remains too slow.
- Consider dedicated pi-emote listening frames.
- Consider making voice submit/stop command phrases configurable.
