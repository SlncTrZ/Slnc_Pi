---
name: vision-analyzer
description: >
  Phân tích ảnh bằng model qwen3-vl:2b-thinking trên Ollama server .171.
  Dùng khi cần xử lý ảnh (đọc text, nhận diện, phân tích hình ảnh)
  vì model Deepseek hiện tại không có Vision.
allowed-tools: bash ctx_shell
---

# Vision Analyzer — Phân tích ảnh (2 provider: MIMO 9router / Ollama)

> Mặc định dùng **oc/mimo-v2.5-free** qua **9router trên .227** (proxy OpenRouter, cost $0, vision MIMO mạnh + reasoning).
> Fallback: qwen3-vl:2b-thinking trên .171 (nhẹ nhưng kém chính xác).

## 🔌 Provider (2026-08-17 — ĐÃ TEST THẬT ✅)

| Provider | Endpoint | Model | Cost | Chất lượng |
|---|---|---|---|---|
| **mimo** (mặc định) | `http://192.168.1.227:20128/v1` (9router) | `oc/mimo-v2.5-free` | $0 | ⭐ Cao (reasoning, chính xác) |
| ollama | `http://192.168.1.171:11434` | `qwen3-vl:2b-thinking` | $0 | Thấp (2B — dễ nhầm) |

### ⚠️ LƯU Ý KỸ THUẬT (đã test)

- **Dùng IP trực tiếp** `192.168.1.227:20128` — domain `https://router.truongcongdinh.org` bị **Cloudflare chặn** (403/1010) vì request non-browser UA
- API key 9router: `sk-286295c6de1aed11-ckqkji-0e3cb76f` (env `NINE_ROUTER_KEY`)
- **MIMO là reasoning model** → cần `max_tokens` đủ lớn (~1500+), nếu content rỗng nghĩa là reasoning chiếm hết budget
- Response có tail `data: [DONE]` (SSE) — script đã tự strip
- Key OpenRouter upstream (9router .env): `sk-or-v1-...` — KHÔNG dùng cho client, chỉ server 9router
- 9router hiện chỉ proxy 8 model Ollama local + model 9router cloud (mimo route qua cloud 9router.com)

## Cách dùng (script có sẵn — không cần viết code)

```bash
node <skill_dir>/scripts/analyze.mjs <đường_dẫn_ảnh> [câu_hỏi] [--provider=mimo|ollama]
```

### Ví dụ

```bash
# Mặc định: MIMO qua 9router (chất lượng cao)
node <skill_dir>/scripts/analyze.mjs K:/screenshot.png "Đọc các dòng chữ trong ảnh"

# Ép dùng Ollama 2B (nhẹ, nhanh)
node <skill_dir>/scripts/analyze.mjs K:/screenshot.png "Mô tả ảnh" --provider=ollama

# Phân tích ảnh từ URL
node <skill_dir>/scripts/analyze.mjs https://example.com/photo.jpg "Mô tả bức ảnh"
```

### Parameters

| Arg | Vị trí | Bắt buộc | Mô tả |
|-----|--------|----------|-------|
| `imagePath` | 1 | ✅ | Đường dẫn file hoặc URL ảnh |
| `prompt` | 2... | ❌ | Câu hỏi / yêu cầu |
| `--provider=` | bất kỳ | ❌ | `mimo` (mặc định) hoặc `ollama` |

### Environment

| Env | Mặc định | Mô tả |
|---|---|---|
| `VISION_PROVIDER` | `mimo` | Override provider |
| `NINE_ROUTER_URL` | `http://192.168.1.227:20128/v1` | Endpoint 9router |
| `NINE_ROUTER_MODEL` | `oc/mimo-v2.5-free` | Model MIMO |
| `NINE_ROUTER_KEY` | key 9router | API key client |
| `OLLAMA_URL` | `http://192.168.1.171:11434` | Endpoint Ollama |

### Script path

Script đặt tại: `scripts/analyze.mjs` (relative to skill directory)

- Hỗ trợ **file local** + **URL**
- Tự động encode base64
- Output ra `stdout` kết quả, log chi tiết ra `stderr`

## Fallback

Nếu 9router/.227 không respond → dùng `--provider=ollama` (.171).
