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
  - `openai-compatible` — OpenAI-compatible `/v1/audio/speech` providers (requires API key)
  - `windows-native` — Local Windows SAPI (no key required, Windows only)
- **Debug** — Test beep playback and TTS synthesis
- **Status** — Show current configuration summary

**Startup flag:**
Override the notification mode at launch:
```bash
pi --notification beep   # or tts, both, off
```

See `docs/CONFIG.md` for environment variables, defaults, and settings file details.

### Emote Extension
Change the active pi-emote face set from inside pi:

```text
/emote list
/emote set aza_choi_nobg
```

The `/emote set` argument autocompletes from the emote sets available in `extensions/pi-emote/emotes/` plus any user or project pi-emote emote folders. The selected default is saved to `~/.pi/agent/extensions/pi-emote/config.json` and applied immediately in the current session.

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
