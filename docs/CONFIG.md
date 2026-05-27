# Notification Configuration

Configuration for the response notification extension.

## Settings File
Settings are persisted to `~/.pi/agent/notification.json` (via `getAgentDir()`).

### Configuration Fields
- `mode`: Notification behavior.
  - `off`: No notifications.
  - `beep`: Play a sound at the start of a response.
  - `tts`: Read the final response using the configured TTS engine.
  - `both`: Beep at the start and read at the end.
- `ttsEngine`: The engine used for speech synthesis.
  - `fish`: High-quality streaming TTS (Fish Audio).
  - `openai-compatible`: OpenAI-compatible TTS API.
  - `windows-native`: Local Windows SAPI (Microsoft Sam).
- `fish`:
  - `apiKey`: API key for Fish Audio.
  - `referenceId`: The voice reference ID to use.
  - `model`: The synthesis model (e.g., `s2-pro`).
- `openAiCompatible`:
  - `apiKey`: API key for the provider.
  - `baseUrl`: The API base URL.
  - `model`: The TTS model to use.
  - `voice`: The voice name/ID.

## Command Usage
The `/notification` command manages settings and testing.

### General Commands
- `/notification`: Show current status.
- `/notification <mode>`: Set mode to `off`, `beep`, `tts`, or `both`.

### Engine Configuration
- `/notification tts-engine <engine>`: Set engine to `fish`, `openai-compatible`, or `windows-native`.
- `/notification tts-key <engine> <key>`: Save API key for specified engine.
- `/notification clear-key <engine>`: Remove stored API key for specified engine.

### Engine-Specific Settings
- `/notification fish-reference <id>`: Update Fish Audio voice reference.
- `/notification openai-url <url>`: Update OpenAI-compatible base URL.
- `/notification openai-model <model>`: Update OpenAI-compatible model.
- `/notification openai-voice <voice>`: Update OpenAI-compatible voice.

### Testing
- `/notification test-beep`: Play the notification beep.
- `/notification test-tts [text]`: Test speech synthesis with optional text.

## Environment Variables
API keys can be provided via environment variables to override stored settings:
- `PI_NOTIFICATION_FISH_API_KEY` or `FISH_AUDIO_API_KEY`
- `PI_NOTIFICATION_OPENAI_TTS_API_KEY` or `OPENAI_API_KEY`
