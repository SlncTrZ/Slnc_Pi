---
name: meilin-kb
description: >
  Giao tiếp với MeiLin Cyber Brain trên Qdrant (2 collection duy nhất:
  cyberbrain_knowledge + cyberbrain_episodic). Dùng để lưu trữ (knowledge_store),
  tra cứu (knowledge_search), conversation memory, và Post-Action logging.
  BẮT BUỘC khi làm việc với knowledge base, server .227, hoặc cần memory recall.
  ⚠️ CHUẨN: dùng MCP tools server meilin-brain (meilin_brain_knowledge_store /
  _knowledge_search / _ai_memory_read / _conversation_save / _conversation_recall) —
  KHÔNG viết node script / fetch REST thủ công.
allowed-tools: bash read write edit ctx_shell ctx_read ctx_grep
---

# MeiLin Cyber Brain — MCP-FIRST (meilin-brain) · REST reference bên dưới

> ⚠️ **LUẬT VÀNG (bắt buộc):** Mọi thao tác KB dùng **MCP tools server `meilin-brain`** — đã có sẵn, tự xử lý embedding + upsert. **KHÔNG viết node script / `node -e` / fetch Qdrant REST thủ công** (gây lỗi escaping + phức tạp không cần thiết).

### MCP TOOLS — BẢNG ÁNH XẠ (dùng CÁI NÀY trước)

| Mục đích | MCP tool (server meilin-brain) | Ghi chú |
| ---------- | ------------------------------ | ------- |
| Lưu tri thức / action log | `meilin_brain_knowledge_store` | Schema: `{content, wing, topic, entity_name, entity_type, importance, change_reason}` — `wing` = code\|ops\|hardware\|research |
| Tìm kiếm ngữ nghĩa (kỹ thuật) | `meilin_brain_knowledge_search` | query 3-5 keywords; score ≥ 0.7 cho wiki-first |
| Đọc ký ức AI | `meilin_brain_ai_memory_read` | ký ức phiên / conversation |
| Lưu hội thoại | `meilin_brain_conversation_save` | vào `cyberbrain_episodic` |
| Tra hội thoại | `meilin_brain_conversation_recall` | semantic search hội thoại |
| Timeline entity | `meilin_brain_knowledge_timeline` | xem lịch sử tiến hóa |

> 📌 Các phần bên dưới (REST API + embedding thủ công) chỉ là **tài liệu tham khảo cấp thấp** — dùng khi MCP không có sẵn / cần debug trực tiếp. Vận hành bình thường: **MCP-first**.

---

## 1. Kết nối

| Component | URL | Auth |
| ----------- | ----- | ------ |
| **Qdrant REST API** | `http://192.168.1.227:6333` | `api-key` (đọc từ secrets, KHÔNG hardcode) |
| **Ollama Embedding** | `http://192.168.1.227:11434` | — |
| **Ollama Fallback** | `http://192.168.1.171:11434` | — |

> 🔑 **Lấy API key từ `~/.pi/agent/secrets/qdrant.json`** (gitignored) — không bao giờ hardcode key trong code/skill:
>
> ```javascript
> // === function: getApiKey() ===
> const { readFileSync, existsSync } = require('node:fs');
> const { join } = require('node:path');
> const { homedir } = require('node:os');
> const SECRETS = join(homedir(), '.pi', 'agent', 'secrets', 'qdrant.json');
> const API_KEY = process.env.QDRANT_API_KEY ||
>   (existsSync(SECRETS)
>     ? JSON.parse(readFileSync(SECRETS, 'utf-8')).qdrant.api_key
>     : '');
> if (!API_KEY) throw new Error('Thiếu QDRANT_API_KEY — tạo ~/.pi/agent/secrets/qdrant.json');
> ```

### Cyber Brain Collections (2 collection duy nhất — chốt 2026-08-11, 768d Cosine)

| Collection | Payload schema | Mục đích |
| ------------ | -------------- | ---------- |
| `cyberbrain_knowledge` | `{content, domain, project, source}` | Tri thức — mọi thứ trừ hội thoại |
| `cyberbrain_episodic` | `{content, agent_name, project, session_id, timestamp}` | Hội thoại / ký ức phiên |

**Domain hợp lệ (field `domain` trong knowledge):** `code` | `ops` | `hardware` | `research`

**Ánh xạ wing cũ (6-wing) → domain mới:**

| Wing cũ | Domain mới | Ghi chú |
| -------- | ---------- | ------- |
| `code_chronicles` | `code` | Code evolution, MCP, API, technical notes |
| `tcdserver` | `ops` | Server infrastructure, docker, deployment |
| `openclaw` | `ops` | AI agents, skills, LLM, MeiLin project |
| `robotics` | `hardware` | Hardware, STM32, Raspberry Pi, sensors |
| `omniscience_wiki` | `research` | Research, theory, concepts, tutorials |
| `conversation` | → `cyberbrain_episodic` | Chat history, conversation memory |

> **Ghi chú:** `wing` cũ vẫn chấp nhận được trong API (tương thích ngược) — tự ánh xạ sang domain/collection. Không có collection `meilin_*` nào nữa.

---

## 2. Embedding Protocol (REFERENCE — MCP đã xử lý sẵn)

> ✅ Khi dùng MCP (`meilin_brain_knowledge_store` / `_search`): embedding tự động — KHÔNG cần tự gọi Ollama.
> Chỉ cần tự gọi khi debug trực tiếp REST:

Mọi thao tác với Qdrant PHẢI qua embedding. Dùng Node.js để tránh lỗi shell escaping:

```javascript
// === function: generateEmbedding(text) → [768 floats] ===
async function generateEmbedding(text) {
  // Dùng .227 (server Docker) mặc định, fallback .171 (local PC)
  const url = 'http://192.168.1.227:11434/api/embeddings';
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'nomic-embed-text', prompt: text })
  });
  const data = await resp.json();
  if (!data.embedding || data.embedding.length !== 768) {
    throw new Error(`Embedding failed: unexpected dims ${data.embedding?.length}`);
  }
  return data.embedding; // [768] float32
}
```

---

## 3. Knowledge Store Protocol

### 3.1 Upsert knowledge → cyberbrain_knowledge

```javascript
// === function: knowledgeStore({ content, domain, project, source, topic, entity_name, entity_type, importance, change_reason }) ===
// domain: code|ops|hardware|research (hoặc wing cũ để tự ánh xạ)
async function knowledgeStore({ content, domain, project, source, topic, entity_name, entity_type, importance, change_reason }) {
  // Step 1: Embedding
  const vector = await generateEmbedding(content);

  // Step 2: Build payload (schema Cyber Brain knowledge)
  const { randomUUID } = require('node:crypto');
  const point = {
    id: randomUUID(),
    vector,
    payload: {
      content,
      domain: domain || 'ops',
      project: project || '',
      source: source || '',
      // meta (giữ versioning & filter)
      topic: topic || 'general',
      entity_name: entity_name || '',
      entity_type: entity_type || 'concept',
      version: 1,
      status: 'active',
      timestamp: new Date().toISOString(),
      change_reason: change_reason || 'Stored via Pi skill meilin-kb',
      summary: content.substring(0, 200),
      importance: importance || 'medium'
    }
  };

  // Step 3: Upsert to Qdrant
  const resp = await fetch('http://192.168.1.227:6333/collections/cyberbrain_knowledge/points', {
    method: 'PUT',
    headers: {
      'api-key': 'API_KEY',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ points: [point] })
  });
  const result = await resp.json();

  // Step 4: Verify
  if (result.status === 'ok') {
    return { success: true, domain, operation_id: result.result?.operation_id };
  }
  return { success: false, error: result.status?.error || 'Unknown error' };
}
```

### 3.2 Lưu hội thoại → cyberbrain_episodic

```javascript
async function episodicStore({ content, agent_name, project, session_id }) {
  const vector = await generateEmbedding(content);
  const { randomUUID } = require('node:crypto');
  const point = {
    id: randomUUID(),
    vector,
    payload: {
      content,
      agent_name: agent_name || 'pi',
      project: project || '',
      session_id: session_id || '',
      timestamp: new Date().toISOString(),
      status: 'active'
    }
  };
  const resp = await fetch('http://192.168.1.227:6333/collections/cyberbrain_episodic/points', {
    method: 'PUT',
    headers: { 'api-key': 'API_KEY', 'Content-Type': 'application/json' },
    body: JSON.stringify({ points: [point] })
  });
  return (await resp.json()).status === 'ok';
}
```

### 3.3 Payload Schema (knowledge)

```json
{
  "content": "string (nội dung chính)",
  "domain": "code|ops|hardware|research",
  "project": "string (tên dự án, optional)",
  "source": "string (file/nguồn gốc, optional)",
  "topic": "string (chủ đề, ví dụ: docker_config, code_evolution, skill)",
  "entity_name": "string (tên entity, optional)",
  "entity_type": "function|class|concept|skill|config|document_chunk|message|technical_note",
  "version": "number (bắt đầu từ 1)",
  "status": "active|deprecated",
  "timestamp": "ISO 8601 (2026-08-11T14:00:00.000Z)",
  "summary": "string (max 200 ký tự)",
  "change_reason": "string (lý do thay đổi)",
  "importance": "high|medium|low"
}
```

---

## 4. Knowledge Search Protocol

### 4.1 Semantic search

```javascript
// === function: knowledgeSearch({ query, domain, topic, limit, threshold }) ===
// domain: code|ops|hardware|research (hoặc wing cũ) — optional, bỏ qua để tìm cả knowledge
async function knowledgeSearch({ query, domain, topic, limit, threshold }) {
  // Step 1: Embedding
  const vector = await generateEmbedding(query);

  // Step 2: Build filter
  const filter = { must: [] };
  if (domain) filter.must.push({ key: 'domain', match: { value: domain } });
  if (topic) filter.must.push({ key: 'topic', match: { value: topic } });

  // Step 3: Search cyberbrain_knowledge
  const resp = await fetch('http://192.168.1.227:6333/collections/cyberbrain_knowledge/points/search', {
    method: 'POST',
    headers: {
      'api-key': 'API_KEY',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      vector,
      limit: limit || 5,
      with_payload: true,
      score_threshold: threshold ?? 0.7,
      filter: filter.must.length > 0 ? filter : undefined
    })
  });
  const data = await resp.json();

  // Step 4: Return results
  return (data.result || []).map(r => ({
    score: r.score,
    domain: r.payload.domain,
    topic: r.payload.topic,
    content: r.payload.content,
    summary: r.payload.summary,
    entity_name: r.payload.entity_name,
    entity_type: r.payload.entity_type,
    version: r.payload.version,
    timestamp: r.payload.timestamp
  }));
}
```

**Threshold note:** Nếu `points_count < 100` → hạ `score_threshold` xuống `1` (không lọc).

### 4.2 Tra cứu hội thoại (ai_memory_read / conversation recall)

```javascript
async function episodicSearch({ query, agent_name, limit, threshold }) {
  const vector = await generateEmbedding(query);
  const filter = { must: [] };
  if (agent_name) filter.must.push({ key: 'agent_name', match: { value: agent_name } });

  const resp = await fetch('http://192.168.1.227:6333/collections/cyberbrain_episodic/points/search', {
    method: 'POST',
    headers: { 'api-key': 'API_KEY', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vector,
      limit: limit || 5,
      with_payload: true,
      score_threshold: threshold ?? 0.6,
      filter: filter.must.length > 0 ? filter : undefined
    })
  });
  const data = await resp.json();
  return (data.result || []).map(r => ({
    score: r.score,
    agent_name: r.payload.agent_name,
    session_id: r.payload.session_id,
    content: r.payload.content,
    timestamp: r.payload.timestamp
  }));
}
```

### 4.3 Query toàn bộ (knowledge + episodic)

```javascript
async function aiMemoryRead(query) {
  const results = [];
  const k = await knowledgeSearch({ query });
  const e = await episodicSearch({ query });
  results.push(...k, ...e);
  return results.sort((a, b) => b.score - a.score).slice(0, 5);
}
```

---

## 5. Post-Action Log Protocol (DÙNG MCP)

> **Rule từ AGENTS.md:** Sau mỗi thay đổi code/file → gọi MCP `meilin_brain_knowledge_store` log chi tiết (file, diff, logic) — KHÔNG viết script thủ công.

```
meilin_brain_knowledge_store({
  content: "[Pi Action Log] Modified file: <file>\nDiff/Summary: ...\nReason: ...\nProject: ...",
  wing: "code",            // hoặc "ops" nếu deploy/server
  topic: "code_evolution", // hoặc "docker_config" khi deploy .227
  entity_name: "pi-action-...",
  entity_type: "technical_note",
  importance: "high",
  change_reason: "Pi action: ..."
})
```

**Khi deploy server .227:** wing `ops`, topic `docker_config`.

---

## 6. Server Context — Auto-read from Qdrant

> **Rule:** Khi làm việc liên quan server .227, docker, deployment → PHẢI đọc Qdrant trước.

Truy vấn server info:

```javascript
const serverInfo = await knowledgeSearch({
  query: 'server infrastructure overview',
  domain: 'ops',
  limit: 5,
  threshold: 0.5
});
```

Quick reference từ kết quả:

- **Server .227**: i5-8250U/8GB/163GB | Ubuntu 24.04 | 18 containers | `/home/dinhtc/docker-all/`
- **PC .171**: Ollama server | models: nomic-embed-text, gemma4:e2b, qwen3-vl:2b-thinking
- **Local**: `H:\Develop` (Windows 11)
- **Networks**: `docker_network` (services) | `deer-flow` (AI: qdrant+ollama) | Cloudflare Tunnel `*.truongcongdinh.org`

---

## 7. Conversation Memory Protocol

### 7.1 Lưu hội thoại → cyberbrain_episodic

```javascript
async function conversationSave({ content, agent_name, project, session_id, importance }) {
  return await episodicStore({
    content,
    agent_name: agent_name || 'pi',
    project: project || '',
    session_id: session_id || `conv_${Date.now()}`,
  });
}
```

### 7.2 Tra cứu hội thoại

```javascript
async function conversationRecall({ query, agent_name, limit }) {
  return await episodicSearch({
    query,
    agent_name,
    limit: limit || 5,
    threshold: 0.6
  });
}
```

### 7.3 Auto-save conversation cho Pi

**Cơ chế:** Cuối mỗi session (hoặc mỗi N tin nhắn), tự động:

1. Tóm tắt conversation thành 1-3 câu
2. Lưu vào `cyberbrain_episodic` với `agent_name: 'pi'`
3. (Optional) Export ra file `.md` trong thư mục chỉ định

---

## 8. Web Research → Cyber Brain Protocol (BẮT BUỘC khi search web)

> **Rule từ Anh (2026-08-07):** Mỗi khi Anh yêu cầu search/nghiên cứu thông tin — PHẢI check wiki trước (domain `research`), trả lời trực tiếp nếu có; chỉ web search khi wiki không đủ. Sau khi tổng hợp xong — PHẢI lưu vào `cyberbrain_knowledge` (domain `research`).

### 8.1 Flow chuẩn

```text
Anh: "Nghiên cứu về model A"
  ┌─> B1: knowledgeSearch({ query: 'model A', domain: 'research', threshold: 0.7 })
  │       ├─> Có kết quả score ≥ 0.7 → trả lời trực tiếp từ wiki (kèm nguồn), KHÔNG web search
  │       └─> Không có (hoặc cần cập nhật mới) → B2
  └─> B2: web_search(query) → tổng hợp answer
        └─> B3: trả lời Anh
              └─> B4: save_web_to_wiki({ query, answer })  ← tự động bởi extension web-wiki-saver
                    (hoặc gọi tool save_web_to_wiki thủ công nếu cần thêm note)
```

### 8.2 Ghi chú

- Extension `web-wiki-saver` tự bắt kết quả `web_search`/`source_check` → lưu vào `cyberbrain_knowledge` (domain `research`, entity_type `web_research`).
- Lần sau search cùng chủ đề → wiki trả kết quả → trả lời trực tiếp, tiết kiệm web search.
- Nếu kết quả web rất mới (đòi hỏi recency) → ưu tiên web search, rồi vẫn lưu wiki để làm mới.

---

## 9. Quick Reference — Node.js Template

Dùng đoạn này để test nhanh trong bash:

```bash
node -e "
const {readFileSync,existsSync}=require('node:fs');
const API_KEY = process.env.QDRANT_API_KEY || (existsSync(require('node:os').homedir()+'/.pi/agent/secrets/qdrant.json') ? JSON.parse(readFileSync(require('node:os').homedir()+'/.pi/agent/secrets/qdrant.json','utf-8')).qdrant.api_key : '');
async function main() {
  const e = await (await fetch('http://192.168.1.227:11434/api/embeddings', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({model:'nomic-embed-text', prompt: process.argv[1] || 'test'})
  })).json();
  console.log('Embedding dims:', e.embedding.length);

  const s = await (await fetch('http://192.168.1.227:6333/collections/cyberbrain_knowledge/points/search', {
    method: 'POST',
    headers: {'api-key':API_KEY,'Content-Type':'application/json'},
    body: JSON.stringify({vector:e.embedding, limit:3, with_payload:true, score_threshold:0.5})
  })).json();
  s.result?.forEach(r => console.log('Score:', r.score, '|', (r.payload.content||'').substring(0,80)));
}
main().catch(e => console.error(e));
"
```

---

## 10. 3-Tier Prioritization (từ AGENTS.md)

| Tier | Khi nào | Action |
| ------ | --------- | -------- |
| **Tier 1** | Có thể đọc file trực tiếp | Dùng `read`/`ctx_read` — SKIP RAG |
| **Tier 2** | Task mới → Skip RAG | Không tra Qdrant |
| **Tier 2** | Task liên quan/debug → Tier 3 | Chuyển xuống dưới |
| **Tier 3** | Cần tra cứu kỹ thuật | `knowledgeSearch` query 3-5 keywords |
| **Tier 3** | Cần nhớ ký ức | `aiMemoryRead` query 3-5 keywords |
