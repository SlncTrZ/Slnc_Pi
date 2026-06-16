---
name: workflow-best-practices
description: >
  Best practices for writing workflow scripts in pi-dynamic-workflows.
  Quan trọng: Đúng syntax để tránh workflow return null với 0 agents.
  Bắt buộc: Top-level await, không async function run() wrapper.
allowed-tools: bash read write edit
---

# Workflow Best Practices — Script Structure

> **CẢNH BÁO:** Sai syntax → workflow return `null`, 0 agents, 0 tokens, 0ms

---

## 1. ĐÚNG Script Structure

### ✅ Template chuẩn (RECOMMENDED)

```javascript
export const meta = {
  name: 'workflow_name',
  description: 'Brief description',
  phases: [
    { title: 'Phase 1: Overview' },
    { title: 'Phase 2: Execution' },
    { title: 'Phase 3: Verification' }
  ]
};

// === TOP-LEVEL AWAIT ===
phase('Phase 1: Overview');
const analysis = await agent('Analyze X', { tier: 'medium', label: 'analyze' });

phase('Phase 2: Execution');
const results = await parallel([
  () => agent('Task A', { tier: 'small', label: 'task-a' }),
  () => agent('Task B', { tier: 'small', label: 'task-b' }),
  () => agent('Task C', { tier: 'small', label: 'task-c' })
]);

phase('Phase 3: Verification');
const verification = await agent('Verify results', { tier: 'medium', label: 'verify' });

return { success: true, analysis, results, verification };
```

---

## 2. ❌ SAI — 3 lỗi phổ biến

### ❌ Lỗi #1: async function wrapper (KHÔNG GỌI)

```javascript
// ❌ SAI - Chỉ define, không execute
export const meta = { ... };

async function run() {
  await agent(...);  // KHÔNG BAO GIỜ CHẠY!
}

// → Workflow return: null, 0 agents, 0 tokens, 0ms
```

### ❌ Lỗi #2: async() => wrapper trong parallel()

```javascript
// ❌ SAI - parallel() KHÔNG chấp nhận async wrapper
const results = await parallel([
  async () => agent('Task A', { tier: 'small' }),
  async () => agent('Task B', { tier: 'small' })
]);

// → parallel() throw TypeError hoặc silent failure
```

### ❌ Lỗi #3: Chỉ có function definition, không có execution

```javascript
// ❌ SAI - Code chỉ define, không chạy
export const meta = { ... };

function phase1() { ... }
function phase2() { ... }

// → Workflow complete ngay lập tức, 0 agents
```

---

## 3. ✅ ĐÚNG — 3 cách viết parallel()

### ✅ Cách #1: Direct function thunks (RECOMMENDED)

```javascript
const results = await parallel([
  () => agent('Task A', { tier: 'small', label: 'task-a' }),
  () => agent('Task B', { tier: 'small', label: 'task-b' }),
  () => agent('Task C', { tier: 'small', label: 'task-c' })
]);
```

### ✅ Cách #2: Map từ array

```javascript
const files = ['file1.ts', 'file2.ts', 'file3.ts'];
const results = await parallel(
  files.map(file =>
    () => agent(`Analyze ${file}`, { tier: 'small', label: file })
  )
);
```

### ✅ Cách #3: IIFE (không recommended)

```javascript
await (async () => {
  const results = await parallel([
    () => agent('Task A', { tier: 'small', label: 'task-a' }),
    () => agent('Task B', { tier: 'small', label: 'task-b' })
  ]);
  return results;
})();
```

---

## 4. Workflow Engine Parse Logic (QUAN TRỌNG)

```typescript
// === workflow.ts parseWorkflowScript() ===
const { meta, body } = parseWorkflowScript(script);

// body = script TRỪ đi phần "export const meta = ..."

const wrapped = `(async () => {
  ${body}  // ← Code trong body được execute
})()`;

const result = await new vm.Script(wrapped).runInContext(context);
```

**Ý nghĩa:**
- Nếu `body` chỉ có `async function run() {}` → IIFE complete ngay → 0 agents
- Nếu `body` có top-level await → agents được execute

---

## 5. Hoàn chỉnh workflow thực tế

```javascript
export const meta = {
  name: 'fix_typescript_errors',
  description: 'Fix TypeScript compilation errors',
  phases: [
    { title: 'Phase 1: Update Types' },
    { title: 'Phase 2: Fix Files' },
    { title: 'Phase 3: Git Ops' },
    { title: 'Phase 4: Verify' }
  ]
};

// Phase 1: Update database types
phase('Phase 1: Update Types');
const dbUpdate = await agent(`
  Update H:/Project/src/types/database.d.ts:
  - Add missingField to SomeInterface
  Return: Confirmation of changes.
`, { tier: 'small', label: 'update database types' });

if (!dbUpdate) {
  return { success: false, error: 'Database types update failed' };
}

// Phase 2: Parallel fix files
phase('Phase 2: Fix Files');
const fixes = await parallel([
  () => agent(`
    Fix file1.ts:
    - Error 1: ...
    - Error 2: ...
    Return: Summary.
  `, { tier: 'small', label: 'fix file1.ts' }),

  () => agent(`
    Fix file2.ts:
    - Error 1: ...
    Return: Summary.
  `, { tier: 'small', label: 'fix file2.ts' }),

  () => agent(`
    Fix file3.ts:
    - Error 1: ...
    Return: Summary.
  `, { tier: 'small', label: 'fix file3.ts' })
]);

const filesFixed = fixes.filter(f => f).length;

// Phase 3: Git operations
phase('Phase 3: Git Ops');
const gitOps = await agent(`
  Handle git issues:
  - Add file.log to .gitignore
  - Stage changes: git add src/
  - Commit: git commit -m "Fix: TypeScript errors"
  Return: Git status, commit hash.
`, { tier: 'medium', label: 'git operations' });

// Phase 4: Verification
phase('Phase 4: Verify');
const verification = await agent(`
  Verify fixes:
  1. Run: npm run lint
  2. Count errors
  3. Run: npm run build
  Return: Error count, build status, health (PASS/FAIL).
`, { tier: 'medium', label: 'verify fixes' });

return {
  success: true,
  filesFixed,
  gitHandled: !!gitOps,
  verification
};
```

---

## 6. Debug workflow failures

### Symptom: `null, 0 agents, 0 tokens, 0ms`

**Nguyên nhân #1:** async function wrapper
```javascript
// ❌ SAI
async function run() {
  await agent(...);
}
// ✅ ĐÚNG
const result = await agent(...);
```

**Nguyên nhân #2:** parallel() với async wrapper
```javascript
// ❌ SAI
await parallel([
  async () => agent(...)
])
// ✅ ĐÚNG
await parallel([
  () => agent(...)
])
```

**Kiểm tra logs:**
```bash
# Workflow logs
~/.pi/workflows/projects/<project>/runs/run-<id>.log

# Workflow state JSON
~/.pi/workflows/projects/<project>/runs/<id>.json
```

**JSON state signature:**
```json
{
  "runId": "...",
  "workflowName": "...",
  "status": "completed",
  "agents": [],           // ← Empty = no agents executed
  "tokenUsage": {
    "input": 0,
    "output": 0,
    "total": 0
  },
  "durationMs": 3         // ← < 10ms = instant complete
}
```

---

## 7. Best Practices Checklist

- [x] `export const meta` là statement đầu tiên
- [x] **KHÔNG** dùng `async function run() {}`
- [x] Dùng **top-level await** trực tiếp
- [x] `parallel()` nhận array của `() => agent(...)` (không `async () =>`)
- [x] Mọi `agent()` call có `label` để dễ debug
- [x] Dùng `tier: 'small'/'medium'/'big'` để route model
- [x] Dùng `phase()` để grouping
- [x] Return final result object

---

## 8. Quick Reference Card

```javascript
// === TEMPLATE ĐÚNG ===
export const meta = {
  name: '...',
  description: '...',
  phases: [{ title: '...' }]
};

phase('Phase 1');
const result1 = await agent('...', { tier: 'medium', label: 'task1' });

phase('Phase 2');
const results = await parallel([
  () => agent('...', { tier: 'small', label: 'task2' }),
  () => agent('...', { tier: 'small', label: 'task3' })
]);

return { success: true, result1, results };
```

**KHÔNG BAO GIỜ:**
```javascript
// ❌ ❌ ❌
async function run() { ... }
await parallel([ async () => agent(...) ])
function doTask() { ... }  // Chỉ define, không gọi
```

---

## 9. Lưu vào Qdrant

> **Bắt buộc:** Lưu knowledge về workflow syntax vào Qdrant

```javascript
await knowledgeStore({
  content: `
    Workflow script structure rules:
    1. KHÔNG dùng async function run() wrapper
    2. Dùng top-level await trực tiếp
    3. parallel() nhận () => agent(...) không async() =>
    4. Meta export phải là statement đầu tiên
    5. Mọi agent() call cần label
  `,
  wing: 'omniscience_wiki',
  topic: 'workflow_syntax',
  entity_name: 'pi-dynamic-workflows-syntax',
  entity_type: 'technical_note',
  importance: 'high',
  change_reason: 'Knowledge store: Workflow best practices after debugging workflow failures'
});
```

---

## 10. Case Study: ToonFlow TypeScript Errors Fix

**Project:** ToonFlow v1.1.7
**Errors:** 17 TypeScript compilation errors
**Files:** database.d.ts + 5 TypeScript files

**Workflow #1, #2, #3 (FAILED):**
```javascript
// ❌ Cấu trúc sai
export const meta = { ... };
async function run() {
  await agent(...);  // Không chạy!
}
// → null, 0 agents, 0 tokens, 0ms (3 lần)
```

**Workflow #4 (SUCCESS):**
```javascript
// ✅ Cấu trúc đúng
export const meta = { ... };
phase('Phase 1');
const dbUpdate = await agent(...);  // Chạy!
// → 8 agents, 1.4M tokens, 215s, 0 TS errors
```

**Bài học:**
- Workflow engine parse: `body = script - export const meta`
- Wrap IIFE: `(async () => { body })()`
- Nếu body chỉ có function definition → IIFE complete ngay
- Nếu body có top-level await → agents execute

---

## 11. Related Documentation

- **pi-dynamic-workflows README:** `~/.pi/agent/npm/node_modules/@quintinshaw/pi-dynamic-workflows/README.md`
- **Workflow source:** `~/.pi/agent/npm/node_modules/@quintinshaw/pi-dynamic-workflows/src/workflow.ts`
- **Workflow logs:** `~/.pi/workflows/projects/<project>/runs/`

**Lệnh useful:**
```bash
/workflows status <id>        # Theo dõi workflow chạy
/workflows save <name>        # Lưu workflow thành command
/workflows-models             # Configure tier mappings
/ultracode [off]              # Bật/tắt ultracode mode
```