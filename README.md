# Slnc_Pi — Pi Extensions & Skills

Personal collection of extensions, skills, and tools for the [pi coding agent](https://github.com/badlogic/pi-mono/).

Includes 8 extensions and 4 skills — all installable in one step.

## Prerequisites

- **pi** installed (`npm install -g @earendil-works/pi-coding-agent`)
- **Node.js** 18+

### Optional (Windows)

- For the emote extension's image rendering, install [Chafa](https://hpjansson.org/chafa/) via `winget install hpjansson.Chafa` and run pi in **Windows Terminal**.

## Install

```bash
git clone https://github.com/SlncTrZ/Slnc_Pi.git
cd Slnc_Pi
npm install
pi install .
```

`npm install` installs this package's runtime dependencies for local path installs. Then start pi (or run `/reload` if already running).

## Uninstall

```bash
pi remove .
```

## Extensions

## Extensions

| Extension | Description | Docs |
|-----------|-------------|------|
| **[notification](extensions/notification/)** | Audio notifications — beep, TTS, or both (4 engine backends) | [README](extensions/notification/README.md) |
| **[voice-input](extensions/voice-input/)** | Local voice input — Voxtral/NeMo worker, 3 listening modes, wake phrase | [README](extensions/voice-input/README.md) |
| **[pi-emote](extensions/pi-emote/)** | Animated pixel-art avatar that reacts to agent activity | [README](extensions/pi-emote/README.md) |
| **[pi-mcp-adapter](extensions/pi-mcp-adapter/)** | Connect to MCP servers via a single ~200-token proxy tool | [README](extensions/pi-mcp-adapter/README.md) |
| **[system-prompt](extensions/system-prompt/)** | Select append-only system prompt profiles, including trust-but-verify validation behavior | [README](extensions/system-prompt/README.md) |
| **[conversation-saver](extensions/conversation-saver/)** | Auto-save Pi conversation to Qdrant MeiLin Knowledge Base | — |
| **[ollama-provider](extensions/ollama-provider/)** | Register local Ollama provider (PC .171: gemma4, qwen3-vl) | — |
| **[clean-status](extensions/clean-status/)** | Hide/replace the animated Working spinner to kill the scrollback ghost-frame artifact (#3083) | [README](extensions/clean-status/README.md) |
| **[pi-core](extensions/pi-core/)** | Native Pi-Core Engine tools (Deepseek API + Docker sandbox) | — |

## Skills

| Skill | Description |
|-------|-------------|
| **[caveman](skills/caveman/)** | Nói tiếng Việt kiểu người tiền sử |
| **[meilin-kb](skills/meilin-kb/)** | Qdrant 6-Wing Knowledge Base with Ollama embedding |
| **[vision-analyzer](skills/vision-analyzer/)** | Phân tích ảnh bằng qwen3-vl:2b-thinking trên Ollama |
| **[workflow-best-practices](skills/workflow-best-practices/)** | Workflow script best practices cho pi-dynamic-workflows |

## Repository Structure

```
Slnc_Pi/
├── extensions/
│   ├── notification/         — Notification extension (beep / TTS)
│   ├── voice-input/          — Local voice input (Voxtral/NeMo worker)
│   ├── pi-emote/             — Pixel-art emote widget (vendored)
│   ├── pi-mcp-adapter/       — MCP server adapter (vendored)
│   ├── system-prompt/        — Append-only system prompt profiles
│   ├── conversation-saver/   — Auto-save conversation to Qdrant
│   ├── ollama-provider/      — Ollama provider (.171 server)
│   ├── clean-status/         — Hide/replace animated Working spinner (ghost-frame fix)
│   └── pi-core/              — Native Pi-Core Engine tools
├── skills/
│   ├── caveman/              — Caveman tiếng Việt
│   ├── meilin-kb/            — Qdrant 6-Wing Knowledge Base
│   ├── vision-analyzer/      — Image analysis (qwen3-vl)
│   └── workflow-best-practices/ — Workflow script syntax
├── prompts/               — Prompt templates (empty, add .md files)
├── docs/
│   ├── CONFIG.md           — Notification configuration reference
│   ├── CODE_STANDARDS.md   — Repository code and workflow standards
│   └── AUTHOR_NOTES.md     — Author-facing documentation guidance
├── package.json            — Root package manifest
└── tsconfig.json           — TypeScript config
```

The root `package.json` declares `pi.extensions`, `pi.skills`, and `pi.prompts` paths. Pi discovers extension subdirectories under `./extensions` and honors each subpackage's `pi.extensions` manifest. For a cloned local checkout, run `npm install` first so extension dependencies are available, then run `pi install .`.

## Adding Your Own Extensions, Skills, or Prompts

- **Extensions:** Create a subdirectory under `extensions/` with a `package.json` containing a `pi.extensions` array pointing to your entry point.
- **Skills:** Add a directory under `skills/` with a `SKILL.md` file.
- **Prompts:** Add Markdown files under `prompts/`.

After adding content, run `/reload` inside pi to pick up the changes.

## Vendored Extensions

`pi-emote` and `pi-mcp-adapter` are vendored copies of their upstream repositories. To update them:

1. Pull changes from the upstream repo into `upstream_extensions/<name>/`
2. Copy the updated files into `extensions/<name>/`
3. Commit and test

## Upstream Sources

| Component | Upstream |
|-----------|----------|
| `pi-emote` | [cgxeiji/pi-emote](https://github.com/cgxeiji/pi-emote) — vendored |
| `pi-mcp-adapter` | [nicobailon/pi-mcp-adapter](https://github.com/nicobailon/pi-mcp-adapter) — vendored |
| `notification` | Local / custom |
| `voice-input` | Local / custom |
| `conversation-saver` | Local / custom |
| `ollama-provider` | Local / custom |
| All skills | Local / custom |
