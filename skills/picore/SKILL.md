---
name: picore
description: >
  Autonomous Coding Agent sử dụng Pi-Core Engine.
  Gọi Deepseek API để decompose task, sinh code, chạy sandbox Docker,
  và review kết quả. MCP server tại .227:3003.
allowed-tools: bash read write edit ctx_shell
---

# Pi-Core — Autonomous Coding Agent

> ✅ Extension `pi-core` đã load → Các tool của Pi-Core Engine được register
> **trực tiếp** vào Pi. Không cần `mcp()` wrapper nữa!

---

## 1. Cách dùng (MỚI)

Extension `pi-core` tự động register 6 tools với prefix `pi_core_`:

| Tool | Mô tả |
|------|-------|
| `pi_core_health` | Health check — verify server .227:3003 và dependencies |
| `pi_core_generate_code` | Sinh code patch qua Worker Agent (Deepseek API) |
| `pi_core_run_sandbox` | Chạy code patch trong Docker sandbox (network: none) |
| `pi_core_review` | Review code patch qua Reviewer Agent |
| `pi_core_status` | Kiểm tra pipeline state |
| `pi_core_run_pipeline` | Full autonomous pipeline: decompose → worker → sandbox → review |

**Gọi trực tiếp, không cần mcp():**
```
# Cũ (deprecated):
mcp({ server: "pi-core", tool: "pi_core_health", args: {} })

# Mới:
pi_core_health
```

---

## 2. Quick Examples

### Kiểm tra server
```
pi_core_health
# → { status: "ok", docker: true, uptime: ... }
```

### Sinh code nhanh
```
pi_core_generate_code spec="Add GET /health endpoint" file_path="src/routes/health.ts" existing_code="..."
```

### Chạy sandbox
```
pi_core_run_sandbox patch="--- a/src/health.ts\n+++ ..." test_commands=["test -f src/health.ts && echo OK"]
```

### Full pipeline
```
pi_core_run_pipeline description="Add health endpoint" repo="/tmp/test-project"
```

### Kiểm tra trạng thái
```
/pi-core
# → "Pi-Core: ✅ connected to .227:3003 | ..."
```

---

## 3. Architecture

```
Anh
  │ pi_core_generate_code(...)
  ▼
Pi Extension (local) → HTTP JSON-RPC → Pi-Core Engine (.227:3003)
  │
  ├─→ Worker Agent → Deepseek API → sinh code patch
  ├─→ Docker Sandbox → network:none → apply + test
  └─→ Reviewer Agent → Deepseek API → review verdict
```

---

## 4. Troubleshooting

**Tool trả lỗi "not connected":**
- Kiểm tra server .227 có hoạt động: `ssh dinhtc@192.168.1.227 "curl -s http://localhost:3003/"`
- Reload Pi: `/reload`

**Tool trả error:**
- Kiểm tra log: `ssh dinhtc@192.168.1.227 "cat /tmp/pi-core-mcp.log | tail -20"`
- Docker sandbox: `ssh dinhtc@192.168.1.227 "docker images pi-sandbox"`

**Fallback (nếu extension lỗi):**
Dùng `mcp()` như cũ:
```
mcp({ server: "pi-core", tool: "pi_core_health", args: {} })
```
