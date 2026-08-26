---
name: vision-analyzer
description: >
  Kênh phân tích ảnh FREE + private/offline (9router $0 / ollama local .171).
  Dùng khi cần xử lý ảnh (đọc text, nhận diện, phân tích hình ảnh) mà muốn
  tiết kiệm chi phí API, giữ ảnh nhạy cảm trong mạng nội bộ, hoặc dự phòng
  khi model chính DeepSeek Vision Exp lỗi/rate-limit.
allowed-tools: bash ctx_shell
---

# Vision Analyzer — Phân tích ảnh (2 provider: 9router / local Ollama)

> Vai trò (từ 2026-08-26): model chính **DeepSeek Vision Exp** giờ ĐÃ CÓ vision.
> Skill này KHÔNG còn là kênh duy nhất — nó là **kênh free + private/offline + fallback**.
> Mặc định 9router $0 (`Olm_171/qwen3.5:9b`), fallback local .171.

## 🔌 Provider (2026-08-26 — ĐÃ TEST THẬT ✅)

| Provider | Endpoint | Model | Cost | Chất lượng |
|---|---|---|---|---|
| **9router** (mặc định, label `mimo`) | `http://192.168.1.227:20128/v1` | `Olm_171/qwen3.5:9b` | $0 | ⭐ Cao (9B vision + reasoning, chính xác) |
| ollama (local) | `http://192.168.1.171:11434` | `qwen3-vl:2b-thinking` | $0 | Thấp (2B — dễ nhầm) |

### ⚠️ LƯU Ý KỸ THUẬT (đã test)

- **Dùng IP trực tiếp** `192.168.1.227:20128` — domain `https://router.truongcongdinh.org` bị **Cloudflare chặn** (403/1010) vì request non-browser UA
- API key 9router: đọc từ env `NINE_ROUTER_KEY` (xem **`.env`** — đã gitignore); KHÔNG hardcode trong code. Mẫu: `.env.example`
- **Model cũ `oc/mimo-v2.5-free` đã KHÔNG còn trên 9router** (list hiện tại là `Olm_171/*` + `Olm_227/*`). Default mới = `Olm_171/qwen3.5:9b` (đã test: đọc chính xác token + full text trong ảnh)
- 9router endpoints là **reasoning model** → cần `max_tokens` đủ lớn (~1500+), nếu content rỗng nghĩa là reasoning chiếm hết budget
- Response có tail `data: [DONE]` (SSE) — script đã tự strip
- 9router hiện proxy model Ollama local (Olm_171/*) + Ollama .227 (Olm_227/*)

## Cách dùng (script có sẵn — không cần viết code)

```bash
node <skill_dir>/scripts/analyze.mjs <đường_dẫn_ảnh> [câu_hỏi] [--provider=mimo|ollama]
```

### Ví dụ

```bash
# Mặc định: 9router Olm_171/qwen3.5:9b (chất lượng cao, $0)
node <skill_dir>/scripts/analyze.mjs K:/screenshot.png "Đọc các dòng chữ trong ảnh"

# Ép dùng Ollama 2B local (nhẹ, private, không gửi ra ngoài)
node <skill_dir>/scripts/analyze.mjs K:/screenshot.png "Mô tả ảnh" --provider=ollama

# Phân tích ảnh từ URL
node <skill_dir>/scripts/analyze.mjs https://example.com/photo.jpg "Mô tả bức ảnh"
```

### Parameters

| Arg | Vị trí | Bắt buộc | Mô tả |
|-----|--------|----------|-------|
| `imagePath` | 1 | ✅ | Đường dẫn file hoặc URL ảnh |
| `prompt` | 2... | ❌ | Câu hỏi / yêu cầu |
| `--provider=` | bất kỳ | ❌ | `mimo` (mặc định, = 9router) hoặc `ollama` |

### Environment

| Env | Mặc định | Mô tả |
|---|---|---|
| `VISION_PROVIDER` | `mimo` | Override provider |
| `NINE_ROUTER_URL` | `http://192.168.1.227:20128/v1` | Endpoint 9router |
| `NINE_ROUTER_MODEL` | `Olm_171/qwen3.5:9b` | Model 9router (9B vision+reasoning) |
| `NINE_ROUTER_KEY` | key 9router | API key client |
| `OLLAMA_URL` | `http://192.168.1.171:11434` | Endpoint Ollama |

### Script path

Script đặt tại: `scripts/analyze.mjs` (relative to skill directory)

- Hỗ trợ **file local** + **URL**
- Tự động encode base64
- Output ra `stdout` kết quả, log chi tiết ra `stderr`

## Fallback

Nếu 9router/.227 không respond → dùng `--provider=ollama` (.171).
