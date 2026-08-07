# Feature Plan: Voice Input Extension — RETIRED

> **Status: RETIRED** — 2026-08-07
>
> Kế hoạch này đã được thực hiện xong và vượt qua phạm vi ban đầu. Quyết định chốt của Anh (SlncTrZ): **sherpa-onnx `zipformer-vi-30M` là primary và đã đủ dùng** cho voice input tiếng Việt (chạy CPU, nhẹ, khởi động nhanh).
>
> Hiện trạng thực tế (xem `extensions/voice-input/README.md`):
>
> - Worker mặc định: **sherpa-onnx** `zipformer-vi-30M` qua WebSocket `ws://127.0.0.1:8766/ws` — tiếng Việt, CPU
> - Voxtral-Mini-4B-Realtime hạ xuống **optional** (`tcp-jsonl`, cần GPU NVIDIA)
> - Wake phrases mặc định: `hi mei`, `hi meilin`
> - Đủ 3 chế độ: push-to-talk, toggle, always-listening (wake phrase gate)
> - Tích hợp pi-emote qua event `voice:state`
>
> Tài liệu này không còn là nguồn tham chiếu. Mọi cập nhật về voice-input dùng README của extension làm chuẩn.
