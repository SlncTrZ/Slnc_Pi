---
name: picore
description: >
  Autonomous Coding Agent sử dụng Pi-Core Engine.
  Gọi Deepseek API để decompose task, sinh code, chạy sandbox Docker,
  và review kết quả. MCP server tại .227:3003.
allowed-tools: bash read write edit mcp ctx_shell
---

# Pi-Core — Autonomous Coding Agent MCP

> ✅ MCP server đã kết nối! Dùng `mcp({ server: "pi-core" })` để xem tools.

---

## 1. Kết nối

```bash
# Kiểm tra kết nối (đã connect tự động nếu skill được load)
mcp({ server: "pi-core" })

# Nếu chưa connect:
mcp({ connect: "pi-core" })
```

Tools được prefix là `pi_core_`:
- `pi_core_run_pipeline`
- `pi_core_generate_code`
- `pi_core_run_sandbox`
- `pi_core_review`
- `pi_core_status`
- `pi_core_health`

---

## 2. Cách dùng tools

### `pi_core_health` — Kiểm tra server
```bash
mcp({ server: "pi-core", tool: "pi_core_health", args: {} })
```

### `pi_core_generate_code` — Sinh code
```bash
mcp({
  server: "pi-core",
  tool: "pi_core_generate_code",
  args: {
    spec: "Add GET /health endpoint returning JSON with status and timestamp",
    file_path: "src/routes/health.ts",
    existing_code: "import { Router } from \"express\";\nconst router = Router();\nexport default router;"
  }
})
```

### `pi_core_run_sandbox` — Chạy sandbox Docker
```bash
mcp({
  server: "pi-core",
  tool: "pi_core_run_sandbox",
  args: {
    patch: "--- a/src/health.ts\n+++ b/src/health.ts\n@@ -1,3 +1,8 @@\n...",
    test_commands: ["test -f src/health.ts && echo OK"]
  }
})
```

### `pi_core_review` — Review code
```bash
mcp({
  server: "pi-core",
  tool: "pi_core_review",
  args: {
    diff: "...patch content...",
    test_output: "...test logs..."
  }
})
```

### `pi_core_status` — Pipeline state
```bash
mcp({ server: "pi-core", tool: "pi_core_status", args: {} })
```

### `pi_core_run_pipeline` — Full autonomous flow
```bash
mcp({
  server: "pi-core",
  tool: "pi_core_run_pipeline",
  args: {
    description: "Add health check endpoint to Express app",
    repo: "/tmp/test-project"
  }
})
```

---

## 3. Quick Examples

### Sinh code nhanh
```
mcp({ server: "pi-core", tool: "pi_core_generate_code", args: {
  spec: "Add GET /health endpoint",
  file_path: "src/routes/health.ts",
  existing_code: "import { Router } from \"express\";\nconst router = Router();\nexport default router;"
}})
```

### Kiểm tra server
```
mcp({ server: "pi-core", tool: "pi_core_health", args: {} })
// → { status: "ok", docker: true, uptime: ... }
```

---

## 4. Architecture

```
Anh
  │ mcp({ server: "pi-core", tool: "pi_core_..." })
  ▼
Pi-Core Engine (.227:3003)
  │
  ├─→ Worker Agent → Deepseek API → sinh code patch
  ├─→ Docker Sandbox → network:none → apply + test
  └─→ Reviewer Agent → Deepseek API → review verdict
```

---

## 5. Troubleshooting

**MCP không connect được:**
```bash
mcp({ connect: "pi-core" })
# hoặc restart server:
bash(ssh dinhtc@192.168.1.227 "curl -s http://localhost:3003/")
```

**Tool trả lỗi:**
- Kiểm tra log: `bash(ssh dinhtc@192.168.1.227 "cat /tmp/pi-core-mcp.log | tail -20")`
- Docker sandbox: `bash(ssh dinhtc@192.168.1.227 "docker images pi-sandbox")`
