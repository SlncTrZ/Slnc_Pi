# Slnc_Pi — Pi Extensions, Skills & Config Backup

Personal collection of extensions, skills, tools, and **full Pi configuration backup** for [pi coding agent](https://github.com/badlogic/pi-mono/).

> ⚡ **Mục tiêu:** Sau khi cài lại Windows, chỉ cần chạy 1 script là có Pi y hệt như cũ.

---

## 🚀 Quick Start (Sau khi cài lại Windows)

### Prerequisites
- **Node.js 22+** — [nodejs.org](https://nodejs.org)
- **Git** — [git-scm.com](https://git-scm.com)
- **Windows Terminal** (recommended)

### Cài đặt tự động

```powershell
# Admin PowerShell — chạy script setup
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\setup-pi.ps1
```

### Cài đặt thủ công từng bước

```bash
# 1. Cài Pi Coding Agent
npm install -g @earendil-works/pi-coding-agent@0.82.0

# 2. Cài các global packages cần thiết
npm install -g \
  @ast-grep/cli@0.44.0 \
  @modelcontextprotocol/server-memory \
  mcp-proxy

# 3. Cài Pi packages (tools/extensions)
pi install npm:@narumitw/pi-goal
pi install npm:pi-lens
pi install npm:pi-ultra-compact
pi install npm:@quintinshaw/pi-dynamic-workflows
pi install npm:pi-web-access
pi install npm:pi-btw
pi install npm:pi-lean-ctx
pi install npm:pi-plan
pi install npm:@heyhuynhgiabuu/pi-pretty

# 4. Clone và cài Slnc_Pi
git clone https://github.com/SlncTrZ/Slnc_Pi.git
cd Slnc_Pi
npm install
pi install .
```

### Khôi phục config (sau khi cài Pi xong)

```bash
# Tự động nếu chạy setup script
# Hoặc copy thủ công:
cp pi-config/settings.json ~/.pi/agent/settings.json
cp pi-config/models.json ~/.pi/agent/models.json
cp pi-config/mcp.json ~/.pi/agent/mcp.json
cp pi-config/notification.json ~/.pi/agent/notification.json
cp pi-config/voice-input.json ~/.pi/agent/voice-input.json
cp pi-config/trust.json ~/.pi/agent/trust.json
cp pi-config/AGENTS.md ~/.pi/agent/AGENTS.md
cp pi-config/APPEND_SYSTEM.md ~/.pi/agent/APPEND_SYSTEM.md

# Auth keys (cần copy thủ công từ backup)
# cp pi-config/secrets/auth.json ~/.pi/agent/auth.json
```

---

## 📦 Cấu trúc repo

```
Slnc_Pi/
├── pi-config/                  # 🆕 Backup Pi configuration
│   ├── settings.json           #   Pi settings (provider, models, packages)
│   ├── models.json             #   9router provider & model definitions
│   ├── mcp.json                #   MCP server connections
│   ├── notification.json       #   TTS & notification config
│   ├── voice-input.json        #   Voice input (wake words, sherpa worker)
│   ├── trust.json              #   Trusted directories
│   ├── AGENTS.md               #   MeiLin agent instructions
│   ├── APPEND_SYSTEM.md        #   Karpathy 12 Rules
│   └── secrets/
│       ├── auth.json           #   🔒 API keys (gitignored)
│       └── auth.json.example   #   Template (placeholder keys)
├── scripts/
│   ├── setup-pi.ps1            # 🆕 Windows 11 setup script
│   └── setup-pi.sh             # 🆕 Linux/WSL setup script
├── extensions/
│   ├── notification/           # Audio notifications (beep / TTS)
│   ├── voice-input/            # Local voice input (sherpa worker)
│   ├── pi-emote/               # Animated pixel-art avatar (vendored)
│   ├── pi-mcp-adapter/         # MCP server adapter (vendored)
│   ├── system-prompt/          # System prompt profiles
│   ├── conversation-saver/     # Auto-save to Qdrant
│   ├── ollama-provider/        # Ollama provider (.171 server)
│   ├── clean-status/           # Hide Working spinner ghost-frame
│   └── pi-core/                # Pi-Core Engine tools
├── skills/
│   ├── caveman/                # Nói tiếng Việt kiểu người tiền sử
│   ├── meilin-kb/              # Qdrant 6-Wing Knowledge Base
│   ├── vision-analyzer/        # Image analysis (qwen3-vl)
│   └── workflow-best-practices/ # Dynamic workflows syntax
├── prompts/                    # Prompt templates (.md files)
├── docs/
│   ├── CONFIG.md               # Notification config reference
│   ├── CODE_STANDARDS.md       # Code & workflow standards
│   └── AUTHOR_NOTES.md         # Documentation guidance
├── package.json                # Package manifest
└── tsconfig.json               # TypeScript config
```

---

## 🔧 Pi Config Backup Details

### Config files backed up in `pi-config/`

| File | Source | Purpose |
|------|--------|---------|
| `settings.json` | `~/.pi/agent/settings.json` | Default provider, packages, enabled models |
| `models.json` | `~/.pi/agent/models.json` | 9router provider + local models |
| `mcp.json` | `~/.pi/agent/mcp.json` | MCP server connections (mempalace, pi-core) |
| `notification.json` | `~/.pi/agent/notification.json` | TTS engine (Omnivoice), beep mode |
| `voice-input.json` | `~/.pi/agent/voice-input.json` | Wake phrases, sherpa worker config |
| `trust.json` | `~/.pi/agent/trust.json` | Trusted directories (H:\Develop) |
| `AGENTS.md` | `~/.pi/agent/AGENTS.md` | MeiLin role & rules |
| `APPEND_SYSTEM.md` | `~/.pi/agent/APPEND_SYSTEM.md` | Karpathy 12 Guidelines |
| `secrets/auth.json` | `~/.pi/agent/auth.json` | 🔒 API keys (gitignored) |

### Các API keys cần thiết

1. **Deepseek** — `sk-xxxx` — từ platform.deepseek.com
2. **Zhipu (zai-coding-cn)** — từ open.bigmodel.cn
3. **9router** — từ 9router (proxy qua Cloudflare tunnel)

---

## 📋 Pi Package Inventory (2026-07-24)

| Package | Version | Type |
|---------|---------|------|
| `@earendil-works/pi-coding-agent` | 0.82.0 | Core |
| `@ast-grep/cli` | 0.44.0 | Global (AST search) |
| `@modelcontextprotocol/server-memory` | latest | Global (MCP) |
| `mcp-proxy` | 6.4.5 | Global (MCP proxy) |
| `@narumitw/pi-goal` | — | Pi goal management |
| `pi-lens` | — | Code lens/diagnostics |
| `pi-ultra-compact` | — | Context compaction |
| `@quintinshaw/pi-dynamic-workflows` | — | Workflow engine |
| `pi-web-access` | — | Web search/fetch |
| `pi-btw` | — | Btw tools |
| `pi-lean-ctx` | — | Lean context |
| `pi-plan` | — | Planning |
| `@heyhuynhgiabuu/pi-pretty` | — | Pretty output |

---

## 🖥️ Extensions

| Extension | Description |
|-----------|-------------|
| **[notification](extensions/notification/)** | Audio notifications — beep, TTS, or both |
| **[voice-input](extensions/voice-input/)** | Local voice input — sherpa worker, wake phrase |
| **[pi-emote](extensions/pi-emote/)** | Animated pixel-art avatar (vendored) |
| **[pi-mcp-adapter](extensions/pi-mcp-adapter/)** | MCP server proxy tool (vendored) |
| **[system-prompt](extensions/system-prompt/)** | Append-only system prompt profiles |
| **[conversation-saver](extensions/conversation-saver/)** | Auto-save to Qdrant MeiLin KB |
| **[ollama-provider](extensions/ollama-provider/)** | Ollama provider (PC .171) |
| **[clean-status](extensions/clean-status/)** | Hide Working spinner ghost-frame |
| **[pi-core](extensions/pi-core/)** | Pi-Core Engine tools |

## 🧠 Skills

| Skill | Description |
|-------|-------------|
| **[caveman](skills/caveman/)** | Nói tiếng Việt kiểu người tiền sử |
| **[meilin-kb](skills/meilin-kb/)** | Qdrant 6-Wing Knowledge Base with Ollama embedding |
| **[vision-analyzer](skills/vision-analyzer/)** | Phân tích ảnh bằng qwen3-vl trên Ollama .171 |
| **[workflow-best-practices](skills/workflow-best-practices/)** | Workflow script best practices |

---

## 🌐 Server Infrastructure

| Server | Spec | Purpose |
|--------|------|---------|
| **.227** | i5-8250U/8GB/163GB — Ubuntu 24.04 | Docker host (18 containers) |
| **.171** | Ollama server | Models: nomic-embed-text, gemma4, qwen3-vl |

### Key endpoints
- Qdrant: `192.168.1.227:6333`
- MemPalace MCP: `192.168.1.227:3002/mcp`
- Pi-Core MCP: `192.168.1.227:3003/mcp`
- Omnivoice TTS: `192.168.1.171:8880/v1`
- Cloudflare Tunnel: `*.truongcongdinh.org`

---

## 📝 Adding Your Own Extensions, Skills, or Prompts

- **Extensions:** Create a subdirectory under `extensions/` with a `package.json` containing a `pi.extensions` array pointing to your entry point.
- **Skills:** Add a directory under `skills/` with a `SKILL.md` file.
- **Prompts:** Add Markdown files under `prompts/`.

After adding content, run `/reload` inside pi.

---

## 🔒 Security

- API keys stored in `pi-config/secrets/auth.json` (gitignored)
- Use `auth.json.example` as template for new installs
- No `.env` files committed
- Server secrets in `chmod 600` on .227
