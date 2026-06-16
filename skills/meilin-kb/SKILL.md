---
name: meilin-kb
description: >
  Giao tiếp với MeiLin Knowledge Base 6-Wing Palace trên Qdrant.
  Dùng để lưu trữ (knowledge_store), tra cứu (knowledge_search),
  conversation memory, và Post-Action logging. BẮT BUỘC khi làm
  việc với knowledge base, server .227, hoặc cần memory recall.
allowed-tools: bash read write edit ctx_shell ctx_read ctx_grep
---

# MeiLin Knowledge Base — Qdrant REST API + Ollama Embedding

> ⚠️ **Luật vàng:** Không gửi payload trần thiếu vector. Embedding trước, upsert sau.

---

## 1. Kết nối

| Component | URL | Auth |
|-----------|-----|------|
| **Qdrant REST API** | `http://192.168.1.227:6333` | `api-key: wQ72uGxOv1kpX5ETBo1FEuKeYWf8ytac11cJIcOg` |
| **Ollama Embedding** | `http://192.168.1.227:11434` | — |
| **Ollama Fallback** | `http://192.168.1.171:11434` | — |

### 6-Wing Collections (all 768d, Cosine distance)

| Wing | Collection | Mục đích |
|------|------------|----------|
| `tcdserver` | `meilin_tcdserver` | Server infrastructure, docker, deployment |
| `openclaw` | `meilin_openclaw` | AI agents, skills, LLM, MeiLin project |
| `robotics` | `meilin_robotics` | Hardware, STM32, Raspberry Pi, sensors |
| `code_chronicles` | `meilin_code_chronicles` | Code evolution, MCP, API, technical notes |
| `omniscience_wiki` | `meilin_omniscience_wiki` | Research, theory, concepts, tutorials |
| `conversation` | `meilin_conversation` | Chat history, conversation memory |

---

## 2. Embedding Protocol (BẮT BUỘC)

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

### 3.1 Upsert knowledge

```javascript
// === function: knowledgeStore({ content, wing, topic, entity_name, entity_type, importance, change_reason }) ===
async function knowledgeStore({ content, wing, topic, entity_name, entity_type, importance, change_reason }) {
  // Step 1: Embedding
  const vector = await generateEmbedding(content);
  
  // Step 2: Build payload
  const { randomUUID } = require('node:crypto');
  const point = {
    id: randomUUID(),
    vector,
    payload: {
      content,
      wing,
      topic,
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
  const resp = await fetch(`http://192.168.1.227:6333/collections/meilin_${wing}/points`, {
    method: 'PUT',
    headers: {
      'api-key': 'wQ72uGxOv1kpX5ETBo1FEuKeYWf8ytac11cJIcOg',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ points: [point] })
  });
  const result = await resp.json();
  
  // Step 4: Verify
  if (result.status === 'ok') {
    return { success: true, wing, operation_id: result.result?.operation_id };
  }
  return { success: false, error: result.status?.error || 'Unknown error' };
}
```

### 3.2 Payload Schema

```json
{
  "content": "string (nội dung chính)",
  "wing": "tcdserver|openclaw|robotics|code_chronicles|omniscience_wiki|conversation",
  "topic": "string (chủ đề, ví dụ: docker_config, code_evolution, skill)",
  "entity_name": "string (tên entity, optional)",
  "entity_type": "function|class|concept|skill|config|document_chunk|message|technical_note",
  "version": "number (bắt đầu từ 1)",
  "status": "active|deprecated",
  "timestamp": "ISO 8601 (2026-06-15T14:00:00.000Z)",
  "summary": "string (max 200 ký tự)",
  "change_reason": "string (lý do thay đổi)",
  "importance": "high|medium|low",
  "source_file": "string (path file gốc, optional)",
  "extra_metadata": "object (metadata bổ sung, optional)"
}
```

---

## 4. Knowledge Search Protocol

### 4.1 Semantic search

```javascript
// === function: knowledgeSearch({ query, wing, topic, limit, threshold }) ===
async function knowledgeSearch({ query, wing, topic, limit, threshold }) {
  // Step 1: Embedding
  const vector = await generateEmbedding(query);
  
  // Step 2: Build filter
  const filter = { must: [] };
  if (wing) filter.must.push({ key: 'wing', match: { value: wing } });
  if (topic) filter.must.push({ key: 'topic', match: { value: topic } });
  
  // Step 3: Search
  const resp = await fetch(`http://192.168.1.227:6333/collections/${wing ? 'meilin_' + wing : 'meilin_code_chronicles'}/points/search`, {
    method: 'POST',
    headers: {
      'api-key': 'wQ72uGxOv1kpX5ETBo1FEuKeYWf8ytac11cJIcOg',
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
    wing: r.payload.wing,
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

### 4.2 Query tất cả wings (ai_memory_read)

```javascript
// Tìm kiếm tất cả wings + conversation
async function aiMemoryRead(query) {
  const results = [];
  const wings = ['tcdserver','openclaw','robotics','code_chronicles','omniscience_wiki','conversation'];
  const vector = await generateEmbedding(query);
  
  for (const wing of wings) {
    const resp = await fetch(`http://192.168.1.227:6333/collections/meilin_${wing}/points/search`, ...);
    results.push(...(data.result || []));
  }
  return results.sort((a, b) => b.score - a.score).slice(0, 5);
}
```

---

## 5. Post-Action Log Protocol (BẮT BUỘC)

> **Rule:** Sau mỗi thay đổi code/file → gọi `knowledge_store` log chi tiết (file, diff, logic).

Mỗi khi em thực hiện thay đổi (edit/write file), PHẢI chạy:

```javascript
await knowledgeStore({
  content: `[Pi Action Log] Modified file: ${filePath}
Diff/Summary: ${briefWhatChanged}
Reason: ${whyItChanged}
Project: ${projectName}`,
  wing: 'code_chronicles',
  topic: 'code_evolution',
  entity_name: `pi-action-${Date.now()}`,
  entity_type: 'technical_note',
  change_reason: `Pi action: ${briefDescription}`
});
```

**Khi deploy server .227:** lưu vào wing `tcdserver`, topic `docker_config`.

---

## 6. Server Context — Auto-read from Qdrant

> **Rule:** Khi làm việc liên quan server .227, docker, deployment → PHẢI đọc Qdrant trước.

Truy vấn server info:

```javascript
const serverInfo = await knowledgeSearch({
  query: 'server infrastructure overview',
  wing: 'tcdserver',
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

### 7.1 Lưu hội thoại

```javascript
async function conversationSave({ content, channel, session_id, role, importance }) {
  return await knowledgeStore({
    content,
    wing: 'conversation',
    topic: 'chat_history',
    entity_name: session_id || `conv_${Date.now()}`,
    entity_type: 'message',
    importance: importance || 'medium',
    change_reason: 'Conversation memory save',
    extra_metadata: {
      channel: channel || 'pi',
      role: role || 'user',
      session_id: session_id || '',
      timestamp: Date.now()
    }
  });
}
```

### 7.2 Tra cứu hội thoại

```javascript
async function conversationRecall({ query, channel, limit }) {
  const results = await knowledgeSearch({
    query,
    wing: 'conversation',
    topic: 'chat_history',
    limit: limit || 5,
    threshold: 0.6
  });
  return results;
}
```

---

## 8. Quick Reference — Node.js Template

Dùng đoạn này để test nhanh trong bash:

```bash
node -e "
async function main() {
  const e = await (await fetch('http://192.168.1.227:11434/api/embeddings', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({model:'nomic-embed-text', prompt: process.argv[1] || 'test'})
  })).json();
  console.log('Embedding dims:', e.embedding.length);

  const s = await (await fetch('http://192.168.1.227:6333/collections/meilin_tcdserver/points/search', {
    method: 'POST',
    headers: {'api-key':'wQ72uGxOv1kpX5ETBo1FEuKeYWf8ytac11cJIcOg','Content-Type':'application/json'},
    body: JSON.stringify({vector:e.embedding, limit:3, with_payload:true, score_threshold:0.5})
  })).json();
  s.result?.forEach(r => console.log('Score:', r.score, '|', (r.payload.content||'').substring(0,80)));
}
main().catch(e => console.error(e));
"
```

---

## 9. 3-Tier Prioritization (từ AGENTS.md)

| Tier | Khi nào | Action |
|------|---------|--------|
| **Tier 1** | Có thể đọc file trực tiếp | Dùng `read`/`ctx_read` — SKIP RAG |
| **Tier 2** | Task mới → Skip RAG | Không tra Qdrant |
| **Tier 2** | Task liên quan/debug → Tier 3 | Chuyển xuống dưới |
| **Tier 3** | Cần tra cứu kỹ thuật | `knowledgeSearch` query 3-5 keywords |
| **Tier 3** | Cần nhớ ký ức | `aiMemoryRead` query 3-5 keywords |
