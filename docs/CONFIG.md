# Notification Configuration

Configuration for the response notification extension.

## Interactive Menu
Run `/notification` to open the drill-down configuration menu:

- **↑↓** — Navigate items
- **Enter** — Select action or enter submenu
- **Esc** — Go back one level (or close at root)

Menu sections:

| Section | Purpose |
|---|---|
| **Mode** | Set notification mode: `off`, `beep`, `tts`, `both` |
| **Engine** | Select TTS engine and configure per-engine settings |
| **Debug** | Test beep playback and TTS synthesis |
| **Status** | Show current configuration summary |

### Engine Configuration
Each engine has its own submenu under **Engine**:

**fish:**
- Select fish
- Set API key (value is never displayed)
- Clear API key
- Set reference ID
- Set model

**openai-compatible:**
- Select openai-compatible
- Set API key (value is never displayed)
- Clear API key
- Set base URL
- Set model
- Set voice

**windows-native:**
- Select windows-native

**vllm-omni:**
- Select vllm-omni
- Browse audio (.wav) — pick a reference audio file via file dialog
- Browse transcript (.txt) — pick the transcript file (optional but recommended)
- Test server connection — verify the server at `http://localhost:8091` is reachable
- Upload & cache voice — upload the audio to the server and cache the voice
- Test TTS playback — synthesize and play a short test sentence

Voice name is auto-derived from the audio file name (e.g. `my_voice.wav` → `my_voice`).
The transcript is read directly from the selected `.txt` file.

## Startup Flag
Override the notification mode at launch:
```bash
pi --notification beep   # or tts, both, off
```

## Settings File
Settings are persisted to `~/.pi/agent/notification.json` (via `getAgentDir()`).

### Configuration Fields
- `mode`: Notification behavior.
  - `off`: No notifications.
  - `beep`: Play a sound at the end of a response.
  - `tts`: Read the final response using the configured TTS engine.
  - `both`: Beep and read the response at the end.
- `ttsEngine`: The engine used for speech synthesis.
  - `fish`: High-quality streaming TTS (Fish Audio).
  - `openai-compatible`: OpenAI-compatible TTS API.
  - `windows-native`: Local Windows SAPI using the system default voice.
  - `vllm-omni`: Local vLLM-Omni server (S2-Pro) via WebSocket streaming.
- `fish`:
  - `apiKey`: API key for Fish Audio.
  - `referenceId`: The voice reference ID to use.
  - `model`: The synthesis model (e.g., `s2-pro`).
- `openAiCompatible`:
  - `apiKey`: API key for the provider.
  - `baseUrl`: The API base URL.
  - `model`: The TTS model to use.
  - `voice`: The voice name/ID.
- `vllmOmni`:
  - `baseUrl`: The vLLM-Omni server base URL (e.g. `http://localhost:8091`).
  - `audioPath`: Path to the local reference `.wav` file.
  - `refTextPath`: Path to the transcript `.txt` file (read automatically, no typing needed).
  - `voiceCached`: Whether the voice has been uploaded to the server.
  - `maxNewTokens`: Maximum generation tokens (default `256`).
  - Voice name is auto-derived from the audio file basename.

## Environment Variables
API keys can be provided via environment variables to override stored settings:
- `PI_NOTIFICATION_FISH_API_KEY` or `FISH_AUDIO_API_KEY`
- `PI_NOTIFICATION_OPENAI_TTS_API_KEY` or `OPENAI_API_KEY`

## Emote Synchronization

When both the notification and pi-emote extensions are installed, the emote's mouth animation syncs to TTS audio:

| Mode | Emote behavior during streaming | Emote behavior during TTS |
|---|---|---|
| `off` | Mouth animates per token, goes idle when streaming ends | N/A |
| `beep` | Mouth animates per token, goes idle when streaming ends | N/A |
| `tts` | Stays in think/tool/idle states (no streaming talk) | Mouth animates for full playback duration |
| `both` | Stays in think/tool/idle states (no streaming talk) | Mouth animates for full playback duration |

## Defaults
| Setting | Default |
|---|---|
| Mode | `off` |
| TTS Engine | `fish` |
| Fish model | `s2-pro` |
| Fish reference_id | `6d370109274d4c29ab83ad6b6af77978` |
| OpenAI-compatible base URL | `http://localhost:8000/v1` |
| OpenAI-compatible model | `tts-1` |
| OpenAI-compatible voice | `alloy` |
| vLLM-Omni base URL | `http://localhost:8091` |
| vLLM-Omni voice name | auto-derived from audio filename |
| vLLM-Omni max_new_tokens | `256` |
| vLLM-Omni sample rate | `44100` (PCM16 mono) |
