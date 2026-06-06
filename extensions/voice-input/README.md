# Voice Input Extension

Local voice input for Pi. The extension captures microphone audio, streams PCM audio to an isolated Python worker, transcribes with Voxtral, appends transcript text into Pi's editor, and can submit the editor with an explicit voice command.

Target model: [`mistralai/Voxtral-Mini-4B-Realtime-2602`](https://huggingface.co/mistralai/Voxtral-Mini-4B-Realtime-2602).

## Install

This extension is part of **[Jarod's Pi Extensions](../../README.md)** and is installed by the parent package. From the repository root:

```bash
npm install
pi install .
```

Then restart pi or run `/reload` if pi is already running.

## Requirements

- Windows + NVIDIA GPU is the first supported target.
- `uvx` available on PATH.
- Hugging Face access to `mistralai/Voxtral-Mini-4B-Realtime-2602`.
- Microphone capture uses `ffmpeg-static` by default and streams 16 kHz mono PCM audio.
- Voxtral native inference runs in the Python worker with dependencies locked under `worker/uv.lock`.
- PyTorch is resolved from the CUDA 12.8 PyTorch wheel index (`https://download.pytorch.org/whl/cu128`) on Windows/Linux for Blackwell GPU support.

## Command

```text
/voice
```

Opens a tree menu for status, listening mode, worker control, settings, and model download. The worker start/restart actions clean stale voice workers, wait for a socket health check, then request model load.

Useful direct commands:

```text
/voice start-worker
/voice stop-worker
/voice restart-worker
/voice status
/voice health
/voice devices
/voice device <exact DirectShow audio device name>
/voice listen
/voice stop
/voice mode push-to-talk
/voice mode toggle
/voice mode always
/voice auto-launch on
/voice auto-launch off
/voice download-model
```

## Shortcut

```text
f8
```

Starts or stops listening using the configured `/voice mode`. `ctrl+shift+v` is avoided because many terminals reserve it for paste.

## Modes

| Mode | Behavior |
|---|---|
| `push-to-talk` | Starts a manual listening session from the shortcut/menu and transcribes accepted speech until stopped with `f8`, `/voice stop`, or a stop phrase. |
| `toggle` | Shortcut/menu toggles listening on and off and transcribes accepted speech. |
| `always` | Keeps listening active, but stays in rejection mode until a wake phrase is detected. Speech heard before the wake phrase is ignored; if the transcript contains a configured wake phrase, the wake phrase is stripped and only the remaining text is appended. After voice or keyboard submission, it resets to the wake-phrase gate. |

Default wake phrases include:

```text
hey emi, hey emy, hey emilia, hey emmy, emi, emy, emilia, emmy
```

## Listening Feedback

The extension keeps a three-line `voice-input` widget visible while voice input is active:

```text
Voice: active listening on (...) · listening mode: transcription enabled
Input: hearing speech (level ... / threshold ...)
Listening server: open · worker state=...
```

In `always` mode, the first line shows whether speech is currently gated:

```text
Voice: active listening on (always) · rejection mode: waiting for wake phrase (hey emi)
```

The input line reports whether audio is below threshold, accepted for transcription, rejected as too short, currently transcribing, or ignored while always-mode is waiting for a wake phrase. When `/new` starts a fresh Pi session, always-mode resets back to the wake-phrase gate before accepting new dictated text.

## Voice Submit Commands

In `toggle` and `always` modes, each finalized speech segment is appended to the editor and the widget enters confirmation mode until you say a send phrase. If you keep speaking normally, the extension keeps appending transcript text; there is no timeout.

To submit the current editor by voice, end an utterance with a send phrase such as:

```text
send it
okay send it
submit it
that's it
okay that's it
Emi send prompt
Emmy submit the message
Hey Emilia, send the prompt
Emi go ahead
Emmy run that
Emi use that
Emi send that
```

Short ambiguous commands such as `go ahead`, `run that`, `use that`, and `send that` require an addressed `Emi` / `Emmy` / `Emilia` prefix so normal dictated text does not accidentally submit.

If useful prompt text comes before the command, the extension keeps the useful text and omits only the command tail. For example:

```text
Please summarize the current file, Emmy run that.
```

adds/submits:

```text
Please summarize the current file
```

Natural mentions that are not submit commands, such as `I need to send the prompt to another tool`, are treated as normal transcription.

To stop listening by voice without submitting, say a standalone stop phrase such as:

```text
stop
stop listening
Emi stop listening
```

If useful text comes before an addressed stop command, the useful text is appended and only the stop command tail is omitted.

## Settings

Settings are persisted to:

```text
~/.pi/agent/voice-input.json
```

Important fields:

- `mode`: `push-to-talk`, `toggle`, or `always` (default: `toggle`).
- `autoLaunchWorker`: start the worker in the background on each Pi session.
- `ffmpegPath`: optional path to ffmpeg binary; if unset, uses `ffmpeg-static`.
- `wakePhrases`: phrases accepted by always-listening mode.
- `sampleRate`: microphone sample rate sent to the worker; default `16000`.
- `audioDevice`: Windows DirectShow audio device name. If unset, the extension auto-selects the first device containing `Microphone`, otherwise the first audio device.
- `workerHost` / `workerPort`: local worker socket endpoint.
- `workerCommand`: optional command override. Defaults to `uvx --refresh --from <extension>/worker pi-voice-worker`.
- `logPath`: worker log path; default `~/.pi/agent/voice-input/voice-worker.log`.
- `captureArgs`: optional ffmpeg argument override for microphone capture.
- `appendSeparator`: text inserted between appended transcript segments (default: space).

## Worker Health And Cleanup

`/voice status` and `/voice health` ping the worker socket and report the worker PID, whether the model is loaded, PyTorch version, CUDA availability/device, and whether the worker thinks it is listening.

When `autoLaunchWorker` is off, starting a new Pi chat/session does not launch a worker. If a manually started worker is already running, the extension adopts that existing worker on the new session so the loaded Voxtral model stays warm across `/new`.

Workers launched by the extension receive Pi's process ID and run a parent-process watchdog. If Pi exits completely, the worker shuts itself down automatically; `/new` does not trigger this because the Pi process is still alive.

`/voice start-worker` and `/voice restart-worker` automatically stop stale Windows `python`/`uv`/`uvx` processes whose command line contains `pi-voice-worker`, start a fresh worker, wait for the worker socket to answer a health ping, and only then request model load. If the health check fails, model load is not started.

## Model Download

Run:

```text
/voice download-model
```

The worker downloads the Voxtral model into the normal Hugging Face cache.

## Emote Integration

The extension emits `voice:state` events through Pi's extension event bus. `pi-emote` listens for those events and can display a listening/transcribing indicator.

## Notes

This extension intentionally keeps model inference outside Pi's Node process. The TypeScript extension handles Pi UX and audio streaming; the Python worker handles Voxtral loading and transcription.

The worker uses a persistent Voxtral streaming session while speech is active. Audio frames are converted into streaming model features and fed through a queue-backed generator, while `TextIteratorStreamer` emits partial transcript updates before the VAD segment closes. A final transcript is emitted when the speech segment closes or listening stops.

The older buffered segment transcription path remains as a fallback for cases where streaming is gated or unavailable. vLLM may still be added as an alternate backend if native Transformers streaming is not fast enough.
