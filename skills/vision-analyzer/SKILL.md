---
name: vision-analyzer
description: >
  Phân tích ảnh bằng model qwen3-vl:2b-thinking trên Ollama server .171.
  Dùng khi cần xử lý ảnh (đọc text, nhận diện, phân tích hình ảnh)
  vì model Deepseek hiện tại không có Vision.
allowed-tools: bash ctx_shell
---

# Vision Analyzer — Phân tích ảnh qua Ollama qwen3-vl

> Dùng model `qwen3-vl:2b-thinking` trên `192.168.1.171:11434`

## ⚠️ THÔNG TIN QUAN TRỌNG (2026-08-13, xác nhận từ Anh)

- **PC .171 là LOCAL PC** — không phải server từ xa. Nó chạy ngay trong mạng nội bộ nhà.
    - **.171 CÓ ĐỦ MODEL CẦN THIẾT** — gồm `qwen3-vl:2b-thinking` (vision) + `nomic-embed-text` + `gemma4:e4b` + `qwythos`/`qwythos-nothink` (verified `ollama list` 2026-08-13).
    - Lưu ý: `qwen3:0.6b` + `qwen3-summarize` nằm trên **Server .227**, KHÔNG phải .171.
    - Ollama .171 bind `192.168.1.171:11434` — gọi qua `localhost:11434` sẽ fail.
- Nếu `curl /api/tags` không respond: server có thể đang BẬN (pull model, gen dài). Chờ 10–30s rồi thử lại — KHÔNG kết luận "thiếu model" ngay.
- KHÔNG pull model khi chưa chắc thiếu — .171 đã đủ; pull chỉ khi model thật sự vắng mặt.

## Cách dùng (script có sẵn — không cần viết code)

Chỉ cần chạy 1 dòng:

```bash
node <skill_dir>/scripts/analyze.mjs <đường_dẫn_ảnh> [câu_hỏi]
```

### Ví dụ

```bash
# Phân tích ảnh local
node <skill_dir>/scripts/analyze.mjs K:/Meilin/idle/idle1.png

# Phân tích với câu hỏi cụ thể
node <skill_dir>/scripts/analyze.mjs K:/screenshot.png "Đọc các dòng chữ trong ảnh"

# Phân tích ảnh từ URL
node <skill_dir>/scripts/analyze.mjs https://example.com/photo.jpg "Mô tả bức ảnh"
```

### Script path

Script đặt tại: `scripts/analyze.mjs` (relative to skill directory)

- Hỗ trợ **file local** + **URL**
- Tự động encode base64
- Output ra `stdout` kết quả
- Log chi tiết ra `stderr`

### Parameters

| Arg | Vị trí | Bắt buộc | Mô tả |
|-----|--------|----------|-------|
| `imagePath` | 1 | ✅ | Đường dẫn file hoặc URL ảnh |
| `prompt` | 2... | ❌ | Câu hỏi / yêu cầu (mặc định: "Mô tả chi tiết nội dung bức ảnh này") |

## Fallback

Nếu `.171` không respond, thử `.227` — sửa URL trong script.
