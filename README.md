# Jarod's Pi Extensions

A collection of extensions for the [pi coding agent](https://github.com/badlogic/pi-mono/).

Includes a notification system (beep / TTS), an animated pixel-art emote widget, and an MCP server adapter — all installable in one step.

## Prerequisites

- **pi** installed (`npm install -g @earendil-works/pi-coding-agent`)
- **Node.js** 18+

### Optional (Windows)
- For the emote extension's image rendering, install [Chafa](https://hpjansson.org/chafa/) via `winget install hpjansson.Chafa` and run pi in **Windows Terminal**.

## Install

```bash
git clone https://github.com/JarodMica/jarods-pi-extensions.git
cd jarods-pi-extensions
pi install .
```

Then start pi (or run `/reload` if already running).

## Uninstall

```bash
pi remove .
```

## Extensions

| Extension | Description | Docs |
|-----------|-------------|------|
| **[notification](extensions/notification/)** | Audio notifications — beep, TTS, or both (4 engine backends) | [README](extensions/notification/README.md) |
| **[pi-emote](extensions/pi-emote/)** | Animated pixel-art avatar that reacts to agent activity | [README](extensions/pi-emote/README.md) |
| **[pi-mcp-adapter](extensions/pi-mcp-adapter/)** | Connect to MCP servers via a single ~200-token proxy tool | [README](extensions/pi-mcp-adapter/README.md) |

## Repository Structure

```
jarods-pi-extensions/
├── extensions/
│   ├── notification/     — Notification extension (beep / TTS)
│   ├── pi-emote/         — Pixel-art emote widget (vendored from cgxeiji/pi-emote)
│   └── pi-mcp-adapter/   — MCP server adapter (vendored from nicobailon/pi-mcp-adapter)
├── skills/               — Skill directories (placeholder, add SKILL.md files)
├── prompts/              — Prompt templates (placeholder, add .md files)
├── docs/
│   └── CONFIG.md         — Notification configuration reference
├── package.json          — Root package manifest (pi discovers extensions/skills/prompts)
└── tsconfig.json         — TypeScript config
```

The root `package.json` declares `pi.extensions`, `pi.skills`, and `pi.prompts` paths. Pi discovers extension subdirectories under `./extensions` and honors each subpackage's `pi.extensions` manifest, so `pi install .` is the single install command.

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

| Extension | Upstream |
|-----------|----------|
| `pi-emote` | [cgxeiji/pi-emote](https://github.com/cgxeiji/pi-emote) |
| `pi-mcp-adapter` | [nicobailon/pi-mcp-adapter](https://github.com/nicobailon/pi-mcp-adapter) |
| `notification` | Local / custom |
