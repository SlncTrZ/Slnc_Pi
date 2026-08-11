# Báo Cáo Sự Cố: MCP Startup Fail + TUI Jump + Pi Exit (ctx stale)

**Ngày lập:** 2026-08-11 23:20 · **Loại:** Phân tích sự cố (Incident Postmortem)
**Phạm vi:** Cấu hình Pi local (Windows) · MCP servers · Extension notification · sync-config.ps1
**Nguồn chính:** Kiểm chứng thực nghiệm (SSH .227, Qdrant REST, git log, test handshake MCP) — không suy đoán

---

<div class="kpis">
<div class="kpi"><div class="lbl">Tổng lỗi phát hiện</div><div class="val" style="color:var(--red)">5 <small>vụ</small></div><div class="note">Trong 1 phiên làm việc</div></div>
<div class="kpi"><div class="lbl">Đã fix + push</div><div class="val" style="color:var(--green)">4 <small>/5</small></div><div class="note">Còn 1 chưa fix (ctx stale)</div></div>
<div class="kpi"><div class="lbl">Root cause chung</div><div class="val" style="color:var(--accent)">1 <small>gốc</small></div><div class="note">sync-config.ps1 ghi đè</div></div>
<div class="kpi"><div class="lbl">Commit đã push</div><div class="val" style="color:var(--purple)">6 <small>commits</small></div><div class="note">62be6b9 → e7442e7</div></div>
</div>

---

## 1. Executive Summary

- **Trong một phiên**, 4 lỗi độc lập cùng xuất hiện (MCP ECONNREFUSED, MCP Connection closed, voice-input worker down, TUI scroll-jump) + 1 lỗi crash **làm Pi thoát hẳn** (`uncaughtException: extension ctx is stale`).
- **4/5 lỗi có chung một gốc rễ**: script `sync-config.ps1` đồng bộ 1 chiều **repo → local (ghi đè)** đã đẩy bản config repo cũ — chứa dịch vụ đã chết (`mempalace`) và placeholder không được Pi hỗ trợ (`{{PI_AGENT_DIR}}`) — **ghi đè lên config local đã được fix đúng**.
- **Lỗi meilin-brain ban đầu bị chẩn đoán nhầm là "race condition khởi động"** — sự thật (kiểm chứng sau): Pi **không expand** `{{PI_AGENT_DIR}}` (docs Pi không hỗ trợ) → python nhận path không tồn tại → process thoát ngay → "Connection closed". Import thực tế chỉ mất **0.14s** — không hề chậm.
- **Lỗi thứ 5 (chưa fix)**: extension `notification` capture `pi.events`/`ctx` cũ; sau `/reload`, `TtsQueue.drain()` gọi `this.events?.emit("tts:end")` (index.ts:2229) → loader `assertActive` ném lỗi → **uncaughtException → Pi thoát**. `notifyFailure` đã được guard (commit e515f36, 49d010a) nhưng **các lệnh `events.emit` trong TtsQueue chưa được guard**.
- **Kết quả**: 4/5 lỗi đã fix + push (6 commits), 8/8 file config local == repo; lỗi ctx stale còn chờ fix (đề xuất guard emit).

---

## 2. Diễn biến & Bằng chứng từng vụ

### Vụ 1 — MCP `mempalace`: `ECONNREFUSED 192.168.1.227:3002`

**Triệu chứng (lúc khởi động Pi):**
```
Error: MCP: Failed to connect to mempalace: SSE error: TypeError: fetch failed: connect ECONNREFUSED 192.168.1.227:3002
MCP: 1/3 servers connected (6 tools)
```

**Kiểm chứng (SSH .227):**
```bash
$ docker ps --format '{{.Names}}\t{{.Ports}}'
ollama    Up 2 hours   0.0.0.0:11434->11434/tcp
pi-core   Up 3 hours   0.0.0.0:3003->3003/tcp      ← 3003 OK
qdrant    Up 3 hours   0.0.0.0:6333-6334->6333-6334/tcp
$ curl -m5 192.168.1.227:3002/mcp  → HTTP 000 (không có gì lắng nghe)
$ curl -m5 192.168.1.227:3003/mcp  → HTTP 200
```

**Kết luận:** `mempalace` đã bị gỡ khỏi .227 (không còn container/service port 3002) nhưng **vẫn còn khai báo trong config** — và bị `sync-config.ps1` kéo về từ repo (repo `pi-config/mcp.json` chưa bao giờ được cập nhật — git log chỉ có commit setup `b736c3e`).

---

### Vụ 2 — MCP `meilin-brain`: `MCP error -32000: Connection closed`

**Triệu chứng:**
```
Error: MCP: Failed to connect to meilin-brain: MCP error -32000: Connection closed
```

**Chẩn đoán ban đầu (SAI):** "race condition — import nặng, Pi gửi initialize quá sớm".
**Kiểm chứng (đúng):**
```bash
# 1. Import nhanh — không phải race:
$ python -c "import meilin_knowledge.config, ..."  → Import xong sau 0.14s

# 2. Path trong config không tồn tại khi không được expand:
$ ls "{{PI_AGENT_DIR}}/git/github.com/SlncTrZ/Slnc_Pi/extensions/meilin-mcp/meilin_mcp.py"
ls: cannot access '{{PI_AGENT_DIR}}/...': No such file or directory

# 3. Docs Pi KHÔNG hỗ trợ placeholder này:
$ rg "PI_AGENT_DIR" node_modules/@earendil-works/pi-coding-agent/{README.md,docs}  → (rỗng)

# 4. Path đầy đủ → handshake THÀNH CÔNG:
$ echo '{"jsonrpc":"2.0","id":1,"method":"initialize",...}' | python "C:/Users/truon/.pi/agent/.../meilin_mcp.py"
{"jsonrpc":"2.0","id":1,"result":{...,"serverInfo":{"name":"meilin-brain","version":"1.28.1"}}}
```

**Kết luận:** `{{PI_AGENT_DIR}}` là template **tự đặt**, Pi đọc nguyên văn → python nhận path không tồn tại → process thoát ngay → "Connection closed". **Fix:** dùng path đầy đủ (commit `e7442e7`), đúng như bản `.bak` đã chạy OK từ chiều.

---

### Vụ 3 — Voice-input: `could not connect to 127.0.0.1:8766`

**Triệu chứng:**
```
Error: [voice-input] worker connection failed: could not connect to 127.0.0.1:8766
```

**Kiểm chứng:**
- `voice-input.json` bản repo (bị sync đè): `workerCommand = ["python", "{{PI_AGENT_DIR}}/.../sherpa_worker.py"]` → path không tồn tại → worker không start → health check 8766 fail.
- Bản `.bak` (bản local trước sync): path đầy đủ `C:/Users/truon/.pi/agent/...` — đã chạy OK (log worker có `Uvicorn running on 127.0.0.1:8766`, health 200).

**Kết luận:** **Cùng lỗi placeholder** với Vụ 2. Fix: revert bản `.bak` (commit `dc7aed2`).

---

### Vụ 4 — Pi TUI bị nhảy scroll về đầu

**Triệu chứng:** Pi TUI (Windows CMD/Windows Terminal) tự nhảy viewport về đầu khi full re-render — **tái phát** sau khi đã fix hôm trước.

**Kiểm chứng (chuỗi bằng chứng):**
```bash
# Fix hôm trước (trong KB): thêm "tuiMode": "fullscreen" vào settings.json
# → tránh ESC[3J (clear scrollback) khi full re-render

$ rg "tuiMode" ~/.pi/agent/settings.json.bak   → 20: "tuiMode": "fullscreen"   ← bản đã fix
$ rg "tuiMode" ~/.pi/agent/settings.json       → (không có)                    ← bị sync ghi đè
$ rg "tuiMode" pi-config/settings.json         → (không có)                    ← repo chưa bao giờ có
$ git log -- pi-config/settings.json           → chỉ 1 commit b736c3e (setup)
```

**Kết luận:** Fix hôm trước chỉ nằm ở local; repo giữ bản `0.82.0` cũ; `sync-config.ps1` ghi đè local → mất `tuiMode` → TUI nhảy lại. Fix: thêm lại + đồng bộ repo (commit `7e9b7bc`).

---

### Vụ 5 — `pi exiting due to uncaughtException: extension ctx is stale` ⚠️ CHƯA FIX

**Triệu chứng (Pi thoát hẳn):**
```
pi exiting due to uncaughtException:
Error: This extension ctx is stale after session replacement or reload.
Do not use a captured pi or command ctx after ctx.newSession(), ctx.fork(),
ctx.switchSession(), or ctx.reload().
    at Object.assertActive (loader.js:141:19)
    at Object.emit (loader.js:335:25)
    at TtsQueue.drain (extensions/notification/index.ts:2229:20)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
```

**Phân tích code (extensions/notification/index.ts):**
```typescript
private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
        while (this.queue.length > 0) {
            const next = this.queue.shift();
            if (!next) continue;
            try {
                await speakText(next, this.getSettings());   // TTS chậm — queue có thể chạy xuyên qua reload
            } catch (error) {
                notifyFailure(this.ctx, ...);                // ✅ ĐÃ GUARD (e515f36, 49d010a)
            }
        }
        this.events?.emit("tts:end");                        // ❌ DÒNG 2229 — CHƯA GUARD → crash
    } finally { ... }
}
```

**Cơ chế:** `TtsQueue` capture `pi.events` + `this.ctx` lúc khởi tạo extension. Nếu Anh `/reload` (hoặc newSession/fork/switchSession) **trong khi TTS queue đang chạy** (đang phát audio / còn item), `drain()` (async) tiếp tục sau reload → `this.events?.emit("tts:end")` gọi trên events cũ → loader `assertActive` ném lỗi → **uncaughtException → Pi thoát hẳn**. Cùng họ lỗi với `notifyFailure` đã fix trước đó — nhưng **sót các lệnh `events.emit`**.

**Trạng thái:** Chưa fix (đề xuất ở mục 5).

---

## 3. So sánh — Bảng tổng hợp

| # | Lỗi | Nguyên nhân gốc | Bằng chứng | Trạng thái |
|---|-----|-----------------|-----------|-----------|
| 1 | mempalace ECONNREFUSED :3002 | Config khai báo service đã chết + sync kéo về từ repo | `docker ps` không có :3002; curl HTTP 000 | ✅ Fix `62be6b9` |
| 2 | meilin-brain Connection closed | `{{PI_AGENT_DIR}}` — Pi không expand → path sai | `ls` No such file; docs Pi rỗng; import 0.14s; handshake OK với path thật | ✅ Fix `e7442e7` |
| 3 | voice-input :8766 down | Cùng placeholder trong `workerCommand` | `.bak` path đầy đủ chạy OK; repo placeholder fail | ✅ Fix `dc7aed2` |
| 4 | TUI scroll-jump tái phát | sync ghi đè `settings.json` mất `tuiMode` | `.bak` dòng 20 có tuiMode; repo không | ✅ Fix `7e9b7bc` |
| 5 | Pi exit ctx stale | `TtsQueue.drain` emit trên events cũ sau reload | Stack trace index.ts:2229; `notifyFailure` đã guard nhưng `emit` chưa | ❌ Chưa fix |

**Phương án khắc phục Vụ 5 (so sánh):**

| Phương án | Ưu | Nhược |
|-----------|-----|-------|
| A. Guard `events.emit` bằng try/catch (giống notifyFailure) | Nhỏ, nhanh, đúng pattern đã có | Không thông báo được lỗi (chỉ log) |
| B. Kiểm tra stale trước khi emit (API Pi có sẵn cách check) | Chủ động, không nuốt lỗi | Cần biết API cụ thể |
| C. Không emit sau reload (skip nếu stale) | Triệt để | Phức tạp hơn |
| **Khuyến nghị: A** | Đúng pattern hiện có, rủi ro thấp nhất | — |

---

## 4. Root Cause Analysis — Gốc rễ chung

```
sync-config.ps1 (repo → local, 1 chiều, ghi đè -Force)
        │
        ├──► V1: đưa mempalace (service chết) về config  → ECONNREFUSED
        ├──► V2: đưa {{PI_AGENT_DIR}} placeholder về mcp.json → Connection closed
        ├──► V3: đưa placeholder về voice-input.json → worker down
        └──► V4: ghi đè settings.json bỏ tuiMode → TUI jump
V5 (ctx stale) — độc lập: extension notification không guard events.emit sau reload
```

**Hai nguyên nhân cấu trúc:**
1. **`sync-config.ps1` thiếu an toàn** (đã xoá): ghi đè mù không diff/confirm, backup 1 lớp `.bak`, không audit log — repo (nguồn chuẩn) không bao giờ được cập nhật sau commit setup → mỗi lần sync là một lần **phá config local đã fix**.
2. **Placeholder `{{PI_AGENT_DIR}}` tự đặt** trong config: Pi không hỗ trợ expand → path sai âm thầm, lỗi hiển thị khó hiểu ("Connection closed" thay vì "file not found").

---

## 5. Khuyến nghị — ADR chốt

1. **ADR-01 ✅ Đã thực hiện (`dc7aed2`)**: **Xoá `sync-config.ps1`** — không file nào khác gọi nó (đã kiểm tra). Quy trình mới: sửa config local → kiểm tra chạy OK → **cập nhật repo tương ứng** (repo phản ánh local, không ngược lại).
2. **ADR-02 ✅ Đã thực hiện (`e7442e7`)**: **Cấm placeholder không được Pi hỗ trợ** trong config — dùng path đầy đủ tuyệt đối. Đã rà soát: không còn `{{...}}` nào trong `~/.pi/agent/*.json`.
3. **ADR-03 ⏳ Đề xuất (Vụ 5)**: Guard **tất cả** `this.events?.emit(...)` trong `TtsQueue` (enqueue `tts:start` + drain `tts:end`) bằng try/catch — đúng pattern `notifyFailure` đã áp dụng. Trước khi fix: **tránh `/reload` khi TTS đang phát**, hoặc chấp nhận rủi ro.
4. **ADR-04 ✅**: `mcp.json`/`settings.json` — sau mỗi thay đổi config, xác minh `local == repo` (8/8 file đã khớp).

---

## 6. Kết luận

- 5 lỗi trong 1 phiên: **4 lỗi cấu hình có chung gốc rễ là `sync-config.ps1`** (đã xoá), **1 lỗi code extension chưa fix** (ctx stale).
- Bài học: mọi thay đổi config phải **cập nhật cả repo** (repo = gương phản chiếu, không phải nguồn ép); không dùng placeholder tự đặt; mọi `ctx`/`events` capture trong extension phải guard sau reload.
- Việc còn lại: (a) Anh gõ `/reload` → xác nhận `MCP: 2/2 servers`; (b) fix Vụ 5 sau khi Anh duyệt; (c) log toàn bộ phát hiện vào KB (chờ meilin-brain connect lại).

---

**Ghi ngày:** 2026-08-11 23:20 · Người lập: MeiLin (Pi) · Người duyệt: SlncTrZ
