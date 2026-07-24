# Pi Configuration Backup

> **Wing:** pi | **Topic:** config-backup | **Updated:** 2026-07-24 16:00

This directory contains a snapshot of the Pi Coding Agent configuration.
Use these files to restore Pi to its exact state after a fresh Windows install.

## Restore

### Method 1: Setup script (recommended)
```powershell
# From Slnc_Pi root
.\scripts\setup-pi.ps1
```

### Method 2: Manual copy
```bash
# Copy all config files to .pi/agent/
cp pi-config/*.json ~/.pi/agent/
cp pi-config/*.md ~/.pi/agent/
cp pi-config/secrets/auth.json ~/.pi/agent/auth.json
```

## Files

| File | Description |
|------|-------------|
| `settings.json` | Pi core settings: default provider/model, packages list, enabled models |
| `models.json` | 9router provider definition with all model specs |
| `mcp.json` | MCP server connections (mempalace, pi-core) |
| `notification.json` | TTS/notification configuration (Omnivoice, beep) |
| `voice-input.json` | Voice input settings (wake words, sherpa worker) |
| `trust.json` | Trusted working directories |
| `AGENTS.md` | MeiLin agent system instructions |
| `APPEND_SYSTEM.md` | Karpathy 12 Guidelines |
| `secrets/auth.json` | API keys (gitignored — local backup only) |
| `secrets/auth.json.example` | Template with placeholder keys |

## Pi v0.82.0 — Package Reference

All packages listed in `settings.json` under `packages`:

- `git:github.com/SlncTrZ/Slnc_Pi` — This repo (extensions, skills, prompts)
- `npm:@narumitw/pi-goal` — Goal management
- `npm:pi-lens` — Code lens/diagnostics
- `npm:pi-ultra-compact` — Context compaction
- `npm:@quintinshaw/pi-dynamic-workflows` — Dynamic workflows
- `npm:pi-web-access` — Web search/fetch tools
- `npm:pi-btw` — Btw tools
- `npm:pi-lean-ctx` — Lean context manager
- `npm:pi-plan` — Planning tools
- `npm:@heyhuynhgiabuu/pi-pretty` — Pretty output

## Model Providers

| Provider | Base URL | Keys in |
|----------|----------|---------|
| `deepseek` | `https://api.deepseek.com` | `auth.json` |
| `zai-coding-cn` | `https://open.bigmodel.cn/api/coding/paas/v4` | `auth.json` |
| `9router` | `https://lite.truongcongdinh.org/v1` | `auth.json` |
| `zai` | `https://api.z.ai/api/coding/paas/v4` | `auth.json` |

## MCP Servers

| Server | URL | Purpose |
|--------|-----|---------|
| `mempalace` | `http://192.168.1.227:3002/mcp` | Knowledge graph, diary, search |
| `pi-core` | `http://192.168.1.227:3003/mcp` | Autonomous coding pipeline |
