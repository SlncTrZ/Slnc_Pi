---
name: picore
description: >
  Autonomous Coding Agent sử dụng Pi-Core Engine.
  Gọi Deepseek API để decompose task, sinh code, chạy sandbox Docker,
  và review kết quả. MCP server tại .227:3003.
allowed-tools: bash read write edit mcp ctx_shell
---

# Pi-Core — Autonomous Coding Agent MCP

> ⚠️ MCP server chạy trên .227:3003. Cần kết nối trước khi dùng tools.

---

## 1. Kết nối

```bash
# Kết nối MCP server
mcp({ connect: "pi-core" })
```

Hoặc gọi tool trực tiếp (server tự động connect nếu chưa có):

```bash
# Liệt kê tools
mcp({ tool: "list_tools", server: "pi-core" })
```

---

## 2. Available Tools (6 tools)

### `run_pipeline` — Full autonomous flow
```bash
mcp({
  server: "pi-core",
  tool: "call_tool",
  args: JSON.stringify({
    name: "run_pipeline",
    arguments: {
      description: "Add health check endpoint",
      repo: "/tmp/test-project",
      constraints: ["no external deps"]
    }
  })
})
```

### `generate_code` — Worker Agent code generation
```bash
mcp({
  server: "pi-core",
  tool: "call_tool",
  args: JSON.stringify({
    name: "generate_code",
    arguments: {
      spec: "Add GET /health endpoint returning JSON with status and timestamp",
      file_path: "src/routes/health.ts",
      existing_code: "import { Router } from \"express\";\nconst router = Router();\nexport default router;"
    }
  })
})
```

### `run_sandbox` — Docker sandbox execution
```bash
mcp({
  server: "pi-core",
  tool: "call_tool",
  args: JSON.stringify({
    name: "run_sandbox",
    arguments: {
      patch: "--- a/src/health.ts\n+++ b/src/health.ts\n@@ -1,3 +1,8 @@\n...",
      test_commands: ["test -f src/health.ts && echo OK"]
    }
  })
})
```

### `review` — Reviewer Agent code analysis
```bash
mcp({
  server: "pi-core",
  tool: "call_tool",
  args: JSON.stringify({
    name: "review",
    arguments: {
      diff: "...patch content...",
      test_output: "...test logs..."
    }
  })
})
```

### `status` — Pipeline state
```bash
mcp({
  server: "pi-core",
  tool: "call_tool",
  args: JSON.stringify({
    name: "status",
    arguments: {}
  })
})
```

### `health` — Server health
```bash
mcp({
  server: "pi-core",
  tool: "call_tool",
  args: JSON.stringify({
    name: "health",
    arguments: {}
  })
})
```

---

## 3. Quick Examples

### Sinh code nhanh
```
Anh: Pi, thêm health endpoint cho project
Em: Chạy generate_code trên Pi-Core MCP → trả code patch
```

### Full pipeline
```
Anh: /picore thêm JWT auth vào PersonalWeb
Em: 
  1. run_pipeline → decompose task
  2. Worker sinh code patch
  3. Sandbox apply + test
  4. Reviewer verify
  5. Trả kết quả
```

---

## 4. Architecture

```
Pi (Anh)
  │ mcp()
  ▼
Pi-Core MCP Server (.227:3003)
  │
  ├─→ Worker Agent → Deepseek API → sinh code patch
  ├─→ Docker Sandbox → network:none → apply + test
  └─→ Reviewer Agent → Deepseek API → review verdict
```

---

## 5. Troubleshooting

**MCP không connect được:**
```bash
# Kiểm tra server còn chạy không
ssh dinhtc@192.168.1.227 "curl -s http://localhost:3003/"

# Restart nếu cần
ssh dinhtc@192.168.1.227 "pkill -f mcp-server; sleep 1; cd /home/dinhtc/pi-core; DEEPSEEK_API_KEY=sk-... LLM_BASE_URL=https://api.deepseek.com MCP_PORT=3003 nohup node packages/mcp-server/dist/index.js > /tmp/pi-core-mcp.log 2>&1 &"
```

**Server chạy nhưng tool trả lỗi:**
- Kiểm tra Deepseek API key còn hạn
- Kiểm tra Docker sandbox image: `docker images pi-sandbox`
- Xem log: `cat /tmp/pi-core-mcp.log | tail -20`
