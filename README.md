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
1. Set a notification mode: `/notification tts`, `/notification beep`, or `/notification both`.
2. (Optional) Configure a TTS engine: `/notification tts-engine <engine>`
   - `fish`: High-quality streaming (requires API key).
   - `openai-compatible`: OpenAI-compatible providers (requires API key).
   - `windows-native`: Local Windows SAPI (no key required).

**Commands:**
Use `/notification` to view status or configure settings (engines, keys, and voices). Run `/notification test-tts` to verify audio.

## Structure

- `extensions/` — TypeScript extensions (auto-discovered)
- `skills/` — Skill directories with `SKILL.md`
- `prompts/` — Prompt template Markdown files

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
