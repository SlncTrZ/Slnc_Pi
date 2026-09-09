---
name: meilin-kb
description: >
  Giao tiếp với MeiLin Cyber Brain v0.2.0 (schema V2) trên Qdrant (2 collection duy nhất:
  cyberbrain_knowledge + cyberbrain_episodic). Dùng để lưu trữ (knowledge_store/memory_store),
  tra cứu (knowledge_search/memory_search), conversation memory, và Post-Action logging.
  BẮT BUỘC khi làm việc với knowledge base, server .227, hoặc cần memory recall.
  ⚠️ CHUẨN: dùng MCP tools server meilin-brain (canonical: meilin_brain_knowledge_store /
  _knowledge_search / _memory_search / _memory_store) — KHÔNG viết node script / fetch REST thủ công.
allowed-tools: bash read write edit ctx_shell ctx_read ctx_grep
---

# MeiLin Cyber Brain — MCP-FIRST (meilin-brain) · REST reference bên dưới

> ⚠️ **LUẬT VÀNG (bắt buộc):** Mọi thao tác KB dùng **MCP tools server `meilin-brain`** — đã có sẵn, tự xử lý embedding + upsert. **KHÔNG viết node script / `node -e` / fetch Qdrant REST thủ công** (gây lỗi escaping + phức tạp không cần thiết).

### MCP TOOLS — BẢNG ÁNH XẠ (dùng CÁI NÀY trước)

| Mục đích | MCP tool (server meilin-brain) | Ghi chú |
| ---------- | ------------------------------ | ------- |
| Lưu tri thức / action log | `meilin_brain_knowledge_store` | Canonical bắt buộc: `{content, domain, topic, entity_type, entity_name}` + optional V2 `verification/provenance_type/origin/importance/change_reason/summary/project/confidence/negative_knowledge/context/extensions`. `domain` = code\|ops\|hardware\|research |
| Tìm kiếm ngữ nghĩa (kỹ thuật) | `meilin_brain_knowledge_search` | query 3-5 keywords; score ≥ 0.7 cho wiki-first; mặc định `view=compact` |
| Fetch chính xác 1 Knowledge | `meilin_brain_knowledge_get` | theo exact UUID ID (không search lại); dùng sau `knowledge_search` khi cần full row |
| Đọc ký ức AI | `meilin_brain_ai_memory_read` | ký ức phiên / conversation (legacy combined) |
| Lưu hội thoại | `meilin_brain_conversation_save` | vào `cyberbrain_episodic` (legacy alias → `memory_store`) |
| Tra hội thoại | `meilin_brain_conversation_recall` | semantic search hội thoại (legacy full-payload) |
| Timeline entity | `meilin_brain_knowledge_timeline` | xem lịch sử tiến hóa |
| **Contract guide** | `meilin_brain_help` | đọc provider contract + tool-current — **chạy trước** khi cần biết tool/version/hash. Trả `provider_version=0.2.0`, `schema_version=2` |
| Tra cứu memory | `meilin_brain_memory_search` | filter session/channel/role/agent/project/topic; mặc định `view=compact` |
| Fetch chính xác 1 Episode | `meilin_brain_memory_get` | theo exact UUID ID (không search lại) |
| Lưu memory | `meilin_brain_memory_store` | cần `session_id` + `event_time`; mặc định `dream_status=pending` |
| Prediction record | `meilin_brain_prediction_record` | lưu `expected_outcome` + `confidence` TRƯỚC khi biết kết quả (causal-learning, không bịa sau) |
| Prediction resolve | `meilin_brain_prediction_resolve` | nối `observed_outcome` → 1 `prediction_id`, sinh prediction-error |
| Prediction observe | `meilin_brain_prediction_observe` | read-only aggregate Prediction/Outcome |
| Prediction pending | `meilin_brain_prediction_pending` | read-only worklist prediction chưa resolve |
| Calibration observe | `meilin_brain_calibration_observe` | read-only phân tích resolved prediction (calibration bias/error) |
| Lưu tri thức (legacy) | `meilin_brain_tech_store` | alias → `knowledge_store` |
| Tra tri thức (legacy) | `meilin_brain_tech_find` | alias → `knowledge_search` |
| **Dreaming enqueue** | `meilin_brain_dream_enqueue` | tạo queue Dreaming/Reasoning — **gọi sau `conversation_save` cuối phiên** |
| Dreaming status | `meilin_brain_dream_status` | trạng thái queue Dreaming |
| Dreaming claim | `meilin_brain_dream_reason_claim` | claim 1 session để suy tưởng |
| Dreaming submit | `meilin_brain_dream_reason_submit` | nộp kết quả suy tưởng |
| Dream review list | `meilin_brain_dream_reviews` | liệt kê candidate cần review |
| Dream review resolve | `meilin_brain_dream_review_resolve` | approve/reject 1 candidate |

> 🔑 **Namespace:** tool thực tế gọi qua gateway có tiền tố `meilin_brain_` (vd `meilin_brain_knowledge_search`). **CyberBrain v0.2.0 — 24 tool = 19 canonical + 5 legacy-alias.** Canonical dùng `domain` (không phải `wing`); `wing` chỉ là alias tương thích. Recall mặc định `view=compact`.

> 💡 meilin-brain = **Cyberbrain v0.2.0** — streamable-http qua URL `https://meilin-mcp.truongcongdinh.org/mcp` (cloudflared → `cyberbrain:8767`). Tool set đầy đủ Cyberbrain (**24 tool**, gồm `help` + `dream_*` + `memory_*` + `knowledge_get`/`memory_get` + `prediction_*`/`calibration_observe`).

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

### 3.3 Payload Schema (knowledge) — V2 (schema_version=2)

> Canonical V2. Required: `content`, `domain`, `topic`, `entity_type`, `entity_name`, `record_class=knowledge`, `identity_trust`*, `lifecycle_state`, `ordinary_recall`. Ngoài MCP, khi debug REST: `wing` (alias) = `domain`.

```json
{
  "schema_version": 2,
  "record_type": "knowledge",
  "record_class": "knowledge",
  "content": "string (nội dung chính)",
  "domain": "code|ops|hardware|research",
  "topic": "string (chủ đề, ví dụ: docker_config, code_evolution, skill)",
  "entity_name": "string (tên entity)",
  "entity_type": "function|class|concept|skill|config|document_chunk|message|technical_note|decision",
  "project": "string (tên dự án, optional)",
  "summary": "string (tối đa 1.200 ký tự cho compact recall)",
  "verification": "user_confirmed|observed|tested|derived|research|unverified",
  "origin": "manual|agent|ingestion|dream|migration|cognition",
  "importance": "high|medium|low",
  "identity_trust": "unspecified|legacy_untrusted|authenticated|system_derived",
  "version": 1,
  "status": "active",
  "lifecycle_state": "active",
  "ordinary_recall": true,
  "retention_score": 1.0,
  "retention_directive": "default",
  "negative_knowledge": false,
  "change_reason": "string (lý do thay đổi)",
  "content_hash": "sha256",
  "created_at": "ISO 8601 Z",
  "updated_at": "ISO 8601 Z"
}
```

> ⚠️ **Ranh giới ordinary recall V2:** search thường chỉ trả `status=active` + `record_class=knowledge` + `ordinary_recall=true`. `record_class=self_model_hypothesis`, `migration_quarantine`, record có `lifecycle_state=suppressed` → KHÔNG vào ordinary recall.

> 🔎 **Compact recall:** `knowledge_search`/`memory_search` mặc định `view=compact` — trả `recall_text` (summary hoặc excerpt ≤1.200 ký tự) + `content_chars` + `content_omitted=true`, ẩn `content`/`summary`. Cần đầy đủ → lấy 1 ID rồi gọi `knowledge_get`/`memory_get`; `view=full` chỉ khi thật sự cần.

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

> **Rule từ AGENTS.md:** Sau mỗi thay đổi code/file → gọi MCP `meilin_brain_knowledge_store` log chi tiết (file, diff, logic) — KHÔNG viết script thủ công. Canonical dùng `domain`, không dùng `wing`.

```
meilin_brain_knowledge_store({
  content: "[Pi Action Log] Modified file: <file>\nDiff/Summary: ...\nReason: ...\nProject: ...",
  domain: "code",              // code|ops|hardware|research
  topic: "code_evolution",     // hoặc "docker_config" khi deploy .227
  entity_type: "technical_note",
  entity_name: "pi-action-...",
  importance: "high",
  verification: "observed",    // user_confirmed|observed|tested|derived|research|unverified
  provenance_type: "agent",
  origin: "agent",             // manual|agent|ingestion|dream|migration|cognition
  change_reason: "Pi action: ...",
  negative_knowledge: false
})
```

**Khi deploy server .227:** domain `ops`, topic `docker_config`.

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

> ⚠️ **SỐ LIỆU CHI TIẾT ĐỌC TỪ POINT `device-inventory`** (topic `device_inventory`, domain `ops`) — đã VERIFIED thực tế 2026-08-13 (9 containers trên .227, 5 models Ollama trên .171, gemma4:e4b chứ KHÔNG phải e2b). KHÔNG tin số liệu cũ ghi trong file này.

- **PC .171** = Windows 11 Pro — máy làm việc (agent chạy tại đây), Ollama bind 192.168.1.171:11434, Omnivoice :8880, H:\Develop
- **Server .227** = Ubuntu 24.04.4 LTS — Docker 9 services: qdrant :6333, ollama :11434, pi-core :3003, n8n :5678, 9router :20128, headroom :8787, file-storage :8085, cloudflared, nginx-reports (qua cloudflared, không map host)
- **Networks**: `docker_network` | `docker-all_default` | Cloudflare Tunnel `*.truongcongdinh.org`

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

### 7.3 Auto-save conversation cho Pi (CUỐI PHIÊN — BẮT BUỘC 2 bước)

**Cơ chế:** Cuối mỗi session (hoặc mỗi N tin nhắn), tự động:

1. Tóm tắt conversation thành 1-3 câu
2. Lưu vào `cyberbrain_episodic` với `agent_name: 'pi'` — `meilin_brain_conversation_save`
3. **`meilin_brain_dream_enqueue`** → tạo queue **Dreaming/Reasoning** (evidence-gated) để hệ thống bên dưới tự suy tưởng. **BẮT BUỘC gọi sau `conversation_save`, đúng thứ tự.**
4. (Optional) Export ra file `.md` trong thư mục chỉ định

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
