# My Pi Extensions

Personal collection of extensions, skills, and prompts for pi.

## Install

```bash
pi install ./pi-extensions
```

## Uninstall

```bash
pi remove ./pi-extensions
```

## Usage

### Notification Extension
Enable audio notifications for assistant responses.

**Setup:**
Run `/notification` to open the interactive configuration menu. Navigate with ↑↓, press Enter to select or drill into submenus, and Escape to go back.

**Menu structure:**
- **Mode** — Choose `off`, `beep`, `tts`, or `both`
- **Engine** — Select and configure a TTS engine:
  - `fish` — High-quality streaming TTS via Fish Audio WebSocket (requires API key)
  - `openai-compatible` — OpenAI-compatible `/v1/audio/speech` providers (API key optional, provider-dependent)
  - `windows-native` — Local Windows SAPI (no key required, Windows only)
  - `vllm-omni` — Local vLLM-Omni server (S2-Pro) via WebSocket streaming PCM audio
- **Debug** — Test beep playback and TTS synthesis
- **Status** — Show current configuration summary

**vllm-omni setup:**
Before using the `vllm-omni` engine you need a running vLLM-Omni server (e.g. S2-Pro) accessible at the configured base URL (default `http://localhost:8091`). Once the server is running:

1. Run `/notification` → Engine → `vllm-omni`
2. **Browse audio (.wav)** — pick your voice reference `.wav` file
3. **Browse transcript (.txt)** — pick the matching transcript (optional but recommended)
4. **Test server connection** — verify the server is reachable
5. **Upload & cache voice** — upload and cache the voice on the server
6. **Test TTS playback** — play a short test sentence to confirm everything works

Voice name is auto-derived from the audio filename. The transcript is read from the selected `.txt` file — no manual typing needed.

**Startup flag:**
Override the notification mode at launch:
```bash
pi --notification beep   # or tts, both, off
```

See `docs/CONFIG.md` for environment variables, defaults, and settings file details.

### Emote Extension
Change the active pi-emote face set from inside pi.

**Interactive menu:** Run `/emote` (no arguments) to open the drill-down configuration menu. Navigate with ↑↓, press Enter to select or drill into submenus, and Escape to go back or close.

**Menu structure:**
- **Emote Set** — Select from available emote sets (current set marked with ▸)
- **Display** — Configure display options:
  - **Image Size** — Set sprite grid width (2–120 columns)
  - **Always Show** — Toggle persistent visibility on narrow terminals
- **Status** — Show current configuration summary

**Subcommands (backward compatible):** All settings save to `~/.pi/agent/extensions/pi-emote/config.json` and apply immediately.

```text
/emote list
/emote set aza_choi_nobg
/emote image-size 32
/emote always-show on
```

- `/emote list` — show current settings and available emote sets
- `/emote set <name>` — change the emote set (autocompletes)
- `/emote image-size <cols>` — change image sprite size (2–120 columns, applies immediately)
- `/emote always-show on|off` — keep the sprite visible even on narrow terminals

**TTS Sync:** When the notification extension is set to `tts` or `both` mode, the emote's mouth animation syncs to TTS audio playback. During token streaming the emote stays in its context-appropriate state (think, tool, etc.) and only enters a talking animation when TTS audio begins. It returns to idle when playback finishes.

## Structure

- `extensions/` — Extension package directories. Each subdirectory can include its own `package.json` with a `pi.extensions` entry.
  - `extensions/notification/` — Local notification extension package.
  - `extensions/pi-emote/` — Vendored third-party pi-emote extension package.
- `skills/` — Skill directories with `SKILL.md`
- `prompts/` — Prompt template Markdown files

The root `package.json` points pi at `./extensions`; pi discovers one level of extension subdirectories and honors each subpackage's `pi.extensions` manifest. This keeps `pi install .` as the single local install command.

## Multi-Agent Checkpoint Workflow

Create a shared base checkpoint after committing the starting state:

```bash
git tag notification-plan-base
git push origin notification-plan-base
```

Start each agent from that same checkpoint on its own branch:

```bash
git checkout -B agent-1-notification notification-plan-base
```

After an agent finishes its attempt, commit and push that branch:

```bash
git add .
git commit -m "Agent 1 notification implementation"
git push origin agent-1-notification
```

Repeat from the same checkpoint for each additional agent:

```bash
git checkout -B agent-2-notification notification-plan-base
git checkout -B agent-3-notification notification-plan-base
```

For separate working folders, create worktrees from the checkpoint:

```bash
git worktree add ../pi-extensions-agent-1 -b agent-1-notification notification-plan-base
git worktree add ../pi-extensions-agent-2 -b agent-2-notification notification-plan-base
```
