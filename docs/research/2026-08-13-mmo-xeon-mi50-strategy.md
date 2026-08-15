# Nghiên cứu: Chiến lược MMO với máy Dual Xeon E5-2680 v4 + AMD MI50 — kết hợp hệ sinh thái AI sẵn có

Ngày lập: 2026-08-13 — Loại báo cáo: Nghiên cứu / Chiến lược — KHÔNG có code

Phạm vi: Khảo sát toàn bộ dự án tại `H:\Develop` (22 repo), đánh giá năng lực phần cứng mới mua chưa lắp (2× Xeon E5-2680 v4 + AMD Instinct MI50 16GB), đối chiếu với thực trạng hạ tầng hiện có (PC .171, Server .227), nghiên cứu web các hướng MMO khả thi: AI video production, nuôi tài khoản/fanpage, cày tool, bán bandwidth/proxy, bán dịch vụ AI local. Đề xuất lộ trình triển khai theo 3 mức ưu tiên.
Nguồn chính: AMD ROCm docs · TechPowerUp · CPU Benchmark · Puget Systems · Kompozy/AIBootcamp/Lumigen (faceless YouTube 2026) · WillItRunAI (VRAM requirements) · Honeygain/Caproxy (bandwidth) · BetonAI/Markaicode (AI services pricing) · blog BunnyHoneyClub (AI shorts studio) · ZingServer/MKT Software (nuôi acc FB)

---

## Tóm tắt nội dung (Executive Summary)

- **Máy Xeon+MI50 là "máy xưởng" (batch worker) chứ không phải máy chạy chính**: MI50 (gfx906) đã bị ROCm đưa vào maintenance mode từ 6.0 (bản cuối hỗ trợ đầy đủ là 5.7), phải dùng workaround (Docker image cộng đồng gfx906, `HSA_OVERRIDE_GFX_VERSION`) — chạy được ComfyUI/SDXL/SVD/Wan2.1-1.3B/LTX nhưng không theo đường official [1][2].
- **VRAM 16GB là nút thắt video**: Wan2.1-14B cần 22-26GB (FP8) → chỉ chạy bản GGUF Q4/Q5 6-10GB + CPU offload; bản 1.3B (8-13GB FP16) và LTX-Video 2B (8GB min/12GB 720p) là "vừa khít" [3][4].
- **Hướng có lợi thế lớn nhất là AI video production theo mô hình "factory"**: sẵn có MovieMaker (13 pipelines), SlncTrZ_VMK (DOM robot tự động hóa Google Flow/ChatGPT/Grok/Gemini/Veo), Omnivoice (TTS 600+ ngôn ngữ, voice cloning) — đây là stack hiếm người có, kết hợp với Xeon để render batch [5][6].
- **Pure-AI channel thu nhập thấp và bị YouTube siết**: policy "inauthentic content" (15/07/2025) đánh vào template content; phải lai AI+human để giữ retention (chênh 3-10×). Median 5-9 tháng mới đạt monetize, $300-2000/tháng ở tháng 12-18 [7][8].
- **Bán bandwidth/proxy và nuôi acc FB là hướng rủi ro cao, lợi nhuận thấp**: Honeygain ~$5-20/tháng/thiết bị; nuôi acc vi phạm ToS Facebook, dễ checkpoint/ban — không nên làm chủ lực [9][10].
- **Hướng bán dịch vụ AI local (deploy cho SME luật/y tế/bất động sản) có giá trị cao nhất**: $2.5K-25K/dự án, solo operator $4K-18K/tháng — tận dụng đúng sức mạnh Xeon 56 threads + MI50 chạy inference 24/7 [11][12].

---

## 1. Hiện trạng tài sản số — 22 dự án tại H:\Develop

### 1.1 Bản đồ dự án (khảo sát trực tiếp 2026-08-13)

| Dự án | Vai trò | Mức độ liên quan MMO |
|---|---|---|
| **MovieMaker** | Electron app, 13 pipeline video AI (drama, cinematic, clip-factory, localization-dub, podcast-repurpose...) | ⭐⭐⭐ Video factory |
| **SlncTrZ_VMK** | Chrome MV3 DOM Robot tự động hóa Google Flow/ChatGPT/Grok/Gemini/Veo (i2p, watermark, WS bridge n8n) | ⭐⭐⭐ Cày tool AI miễn phí |
| **Omnivoice** | TTS zero-shot 600+ ngôn ngữ, voice cloning, RTF 0.025 (chạy API 8880 trên .171) | ⭐⭐⭐ Dub/lồng tiếng |
| **Training** | Fine-tune Qwen3-0.6B QLoRA (unsloth), dataset EN+VI 15,765 mẫu, xuất GGUF cho Ollama | ⭐⭐ Model riêng |
| **OpenMontage** | Pipeline YAML manifests + skill files + tool registry | ⭐⭐ Xương sống pipeline |
| **TheGhost** | Cyber Brain framework (research→ADR→code→nghiệm thu) + benchmark tooling | ⭐ Quy trình |
| **Dataset** | Pipeline VAD→transcribe→validate→assemble→TTS augment | ⭐ Data tự sinh |
| **Slnc_Pi** | Config agent Pi + scripts (md2html, setup) | ⭐ Hạ tầng |
| **Omnivoice/DMX/ArtNet/UAV/Ebook...** | DMX autopilot, ArtNet controller, UAV flying wing, ebook translator | — Ngoài phạm vi MMO |

### 1.2 Năng lực cốt lõi đã chứng minh (evidence từ repo)

- **MovieMaker**: 13 pipeline production sẵn sàng, backlot approve/reject gates, AI SDK 12 vendor adapters — đã hoàn thiện proposal + plan (MOVIEMAKER_PROPOSAL.md, TOONFLOWX_PLAN.md) [5].
- **SlncTrZ_VMK**: 21 module extension, đã fork từ Toby Flow v1.1.2, tự động hóa generation qua web miễn phí — "3 việc: Input → Submit → Output" [6].
- **Training**: đã chạy fine-tune thật (báo cáo đánh giá 2026-08-12: 15,765 mẫu, batch 8, coverage 25% với 500 steps) — pipeline chạy được, đang tối ưu tham số [13].

### 1.3 Hạ tầng hiện có (KB device inventory v2, verified 2026-08-13)

| Máy | Cấu hình | Vai trò hiện tại |
|---|---|---|
| **PC .171** (Slnc_TrZ) | i5-12400F, 24GB RAM, RTX 3060 12GB, Win 11 | Agent Pi/OpenCode, Ollama (qwen3-vl, gemma, nomic-embed), Omnivoice API 8880, ComfyUI (12.4GB RAM khi chạy) |
| **Server .227** (ASUS X542UQR) | i5-8250U, 8GB RAM, 940MX 2GB, Ubuntu 24.04 | Docker: qdrant, ollama, pi-core, n8n, cloudflared, nginx-reports, pandoc |
| **Máy MỚI (chưa lắp)** | 2× Xeon E5-2680 v4 + AMD MI50 16GB | Chưa quyết định — chính là chủ đề báo cáo này |

---

## 2. Phân tích phần cứng mới: 2× Xeon E5-2680 v4 + MI50

### 2.1 Thông số kỹ thuật (verified nguồn chính thức)

**Dual Xeon E5-2680 v4** [14]:
- 2× 14 cores = **28 cores / 56 threads**, Broadwell-EP (2016), base 2.4GHz / turbo 3.3GHz
- 2× 120W TDP = 240W (không tính RAM/platform), CPU Mark ~27,183 (2 socket)
- **Điểm yếu**: single-thread thấp (1,946 MOps/s — bằng ~47% CPU hiện đại) → model LLM inference theo prompt bị chậm
- **Điểm mạnh**: H.264 4K software encode ~37fps, HEVC 4K ~23fps, ProRes 4K ~71fps (bench với RTX 3090) → **render video batch song song rất tốt**

**AMD Instinct MI50** [15][16]:
- **16GB HBM2 ECC, băng thông 1TB/s**, 300W TDP, PCIe 4.0
- 26.5 TFLOPS FP16 / 13.3 TFLOPS FP32 — FP16 gấp đôi FP32 → **ưu tiên chạy FP16/quantized**
- VCE 4.1: encode H.264/HEVC (KHÔNG AV1); passive cooling (cần gió)
- **⚠️ Hỗ trợ phần mềm**: gfx906 → ROCm 6.0 chuyển maintenance mode; **ROCm 5.7 là bản cuối hỗ trợ đầy đủ**; báo cáo user 2025: support bị drop ở 6.4.0 [1][2]

### 2.2 Đánh giá khả năng chạy ComfyUI / AI trên MI50

| Workload | Khả thi? | Ghi chú thực nghiệm cộng đồng |
|---|---|---|
| ComfyUI (SD1.5/SDXL) | ✅ Có | Docker image cộng đồng "Mixer 3607" cho gfx906, Ubuntu 24.04; SD Turbo 512px <1s; SDXL 1024px chạy được |
| Stable Video Diffusion | ✅ Có | `--force-fp32` giúp nhanh đáng kể trên AMD (30 phút → 1 phút) |
| Wan2.1-1.3B (video) | ✅ Vừa khít | FP16 8-13GB, GGUF Q4 4-6GB — MI50 16GB OK |
| LTX-Video 2B | ✅ Vừa khít | 8GB min / 12GB 720p |
| Wan2.1-14B | ⚠️ Nén mới chạy | FP16 54-65GB / FP8 22-26GB → bắt buộc GGUF Q4/Q5 6-10GB + T5 CPU offload (cần 24-32GB RAM) — **Xeon 56 threads + RAM DDR4 rẻ là điểm tựa** |
| FLUX.1 (12B) | ⚠️ Nén | tương tự Wan2.1-14B, GGUF Q4 + offload |
| LLM inference (llama.cpp/Ollama) | ✅ Tốt | 74 tok/s trên 120B với 3 GPU (2×MI50+Radeon VII) — 16GB HBM2 + băng thông 1TB/s là lợi thế |

**Kết luận phần cứng**: MI50 là GPU "compute-first" phù hợp **inference + image/video gen tầm trung** chứ không phải GPU mạnh nhất cho training hiện đại (không FP8/FP4, không tensor core kiểu mới). Điểm bù là HBM2 16GB 1TB/s giá rẻ + CPU 56 threads cực mạnh cho pipeline (encode, offload, data processing). [3][4][17]

### 2.3 Chi phí vận hành (ước tính)

| Thành phần | Công suất | Ghi chú |
|---|---|---|
| 2× Xeon (idle→load) | ~110W → 240W+ | idle thực tế cả hệ 2 socket ~110-220W tùy RAM/HDD [18] |
| MI50 | 300W peak | passive, cần quạt |
| RAM + platform + quạt | ~50-80W | |
| **Tổng full-load ước tính** | **~450-600W** | ≈ 10-14 kWh/ngày nếu chạy 24/7 |
| **Tiền điện VN (~2,500đ/kWh)** | **~750K-1,050K₫/tháng** | chạy 24/7 full load |

---

## 3. Phân tích các hướng MMO — có nguồn, có con số

### 3.1 Hướng A: AI Video Production (faceless channel + shorts factory) ⭐ Lợi thế nhất

**Bối cảnh thị trường 2026** [7][8][19]:
- Faceless YouTube **vẫn khả thi** nhưng: pure-AI (script+TTS+stock B-roll, không human edit) retention kém 3-10× so với hybrid AI+human
- **Policy mới 15/07/2025**: YouTube đổi "repetitious content" → "inauthentic content", nhắm thẳng mass-produced AI template; phải có "significant original commentary/educational/entertainment value"
- Income reality: $0 trong 6-12 tháng đầu (đủ 1,000 subs + 4,000h watch / 10M Shorts views 90 ngày); median 5-9 tháng đạt monetize; tháng 12-18: **$300-2,000/tháng** niche tốt
- RPM cao: finance/tech/education $15-45; gaming/entertainment $2-7
- **Cần đa kênh thu nhập**: affiliate, sponsorship, digital products — ad revenue đơn thuần chỉ $2-4 RPM ở niche AI

**Con số shorts automation** [20][21]:
- Studio lớn: 1 tỷ views/tháng, 60 accounts, 31K shorts/tháng, chi phí $0.18-0.42/short, 5.4× revenue/cost
- Solo creator: 60 video tự động → **$34 sau 1 tháng** (Shorts Fund + TikTok + affiliate) — median render 4.3 phút/video
- AutoShorts.ai: $40K MRR <6 tháng, margin 75%
- ⚠️ "Fully autonomous" là marketing; vẫn cần human review ở checkpoints; moderation không nhất quán giữa các nền tảng

**Lợi thế riêng của Anh** (không ai khác có):
- MovieMaker 13 pipelines → tự động hóa toàn bộ quy trình idea→script→storyboard→video
- SlncTrZ_VMK DOM robot → dùng Google Flow/ChatGPT/Grok/Gemini/Veo **miễn phí qua web** (không tốn API $), có watermark + batch
- Omnivoice → lồng tiếng 600+ ngôn ngữ, voice cloning → **localization/dub pipeline** (localization-dub pipeline của MovieMaker đã có sẵn!)
- Xeon 56 threads → batch render nhiều video song song, không nghẽn CPU encode

### 3.2 Hướng B: Bán dịch vụ AI local (deploy cho SME) ⭐ Giá trị cao nhất/dự án

**Thị trường** [11][12]:
- Doanh nghiệp nhỏ (luật, y tế, home services, bất động sản) cần AI nhưng không gửi dữ liệu nhạy cảm lên cloud → cần deploy local
- Pricing tiered: Starter $2.5K-5K (workstation + 1-2 models + RAG basic) → Professional $8K-15K → Enterprise $15K-25K + $2K-5K/tháng retainer
- **Solo operator: $4K-18K/tháng với 2-4 khách**; Ollama rental: 10-20 khách × $5-15/tháng → $500-2,000/tháng trong 6 tháng
- Outreach theo "specific business observation" thay vì generic pitch

**Khớp với hạ tầng**:
- Xeon 56 threads + MI50 16GB + RAM DDR4 rẻ → máy inference 24/7 rất hợp cho 10-20 client nhỏ
- Đã có: Ollama (chạy nhiều model), n8n, cloudflared tunnel (đã có `*.truongcongdinh.org`!), pi-core → đủ nền để làm AI gateway cho khách
- Đã có kinh nghiệm fine-tune Qwen3 + dataset VN → có thể bán model tiếng Việt riêng

### 3.3 Hướng C: Nuôi tài khoản / fanpage / group tự động ⚠️ Rủi ro cao

**Thực trạng** [10][22]:
- Vi phạm ToS Facebook → ban tạm thời/vĩnh viễn kèm fanpage/group/ad account
- Tool phổ biến VN: MKT Care, Maxcare, Ninja Care (quản lý hàng trăm acc, auto like/comment/share, vượt checkpoint, proxy management)
- "An toàn" tương đối: 1 acc 1 residential proxy, IP ổn định, tốc độ tự nhiên, giả lập hành vi thật (scroll, view...)
- Rủi ro: checkpoint (vd 282), lock, ban; tool có thể thu thập dữ liệu người dùng

**Đánh giá**: Lợi nhuận đến từ bán acc/fanpage đã nuôi hoặc chạy ads — mảng xám, cạnh tranh với tool thương mại sẵn có, rủi ro mất trắng tài sản số. **Chỉ nên làm ở mức phụ trợ** (nuôi vài acc chính chủ để chạy content của chính mình), không làm sản phẩm chính. Phần cứng Xeon/MI50 **không mang lại lợi thế gì** cho hướng này (nuôi acc phụ thuộc proxy/device fingerprint, không phụ thuộc GPU).

### 3.4 Hướng D: Bán bandwidth / proxy ⚠️ Lợi nhuận thấp, rủi ro pháp lý

**Thực trạng** [9]:
- Honeygain/ByteLixir/PacketStream/ProxyRack: $0.10-0.50/GB, **1 device 1 IP: $5-20/tháng** (vùng US/UK/Đức cao nhất)
- Nhiều IP + referral: $50-100+/tháng nhưng cần 24/7 uptime, 50+ Mbps, IP riêng từng device
- Điều kiện: vị trí địa lý (US/EU premium), tốc độ, số IP, uptime — **IP VN giá rẻ, máy Xeon tiêu 450-600W để kiếm $5-20/tháng là lỗ điện**

**Đánh giá**: Không kinh tế với máy tiêu thụ điện cao; IP Việt Nam không thuộc vùng premium. **Loại bỏ** hoặc chỉ cài Honeygain trên máy rẻ tiền luôn bật sẵn. Rủi ro pháp lý khi bán proxy (dùng cho bot, fraud) cũng đáng cân nhắc.

### 3.5 Hướng E: Cày tool / automation service

- **Cày tool hợp pháp**: dùng SlncTrZ_VMK + n8n để tự động hóa công việc content (scheduling, batch gen, cross-post) cho chính Anh hoặc bán service "AI content automation" cho SME ($200-1,000/tháng/khách) — kết hợp tốt với 3.2
- **Cày game/click**: hầu hết vi phạm ToS game, thu nhập thấp, không cần GPU mạnh → không khuyến nghị
- **Tool marketplace**: bán script/extension đã làm (VD: VMK dạng product) — nguồn thu passive tốt, có thể đóng gói thành SaaS nhỏ

---

## 4. So sánh phương án

| Tiêu chí | A. AI Video Factory | B. AI Service SME | C. Nuôi acc FB | D. Bán bandwidth |
|---|---|---|---|---|
| **Khớp hạ tầng sẵn có** | ⭐⭐⭐ (MovieMaker+VMK+Omnivoice) | ⭐⭐⭐ (Ollama+n8n+tunnel+finetune) | ⭐ (không dùng GPU) | ⭐ (không dùng GPU, IP VN rẻ) |
| **Khớp Xeon+MI50 mới** | ⭐⭐⭐ (batch render, video gen) | ⭐⭐⭐ (inference 24/7, 16GB HBM2) | ⭐ | ⭐ |
| **Vốn khởi đầu** | Thấp (đã có hết) | Thấp-Trung (deploy + marketing) | Trung (proxy, tool) | Rất thấp |
| **Thu nhập tiềm năng** | $300-2K/tháng (12-18 tháng) / factory scale hơn | **$4K-18K/tháng** solo | Không ổn định, mảng xám | $5-20/tháng |
| **Thời gian ra tiền** | 5-9 tháng (monetize YT) | 2-4 tháng | Nhanh nhưng rủi ro ban | Ngay nhưng cực thấp |
| **Rủi ro** | Policy YT thay đổi, content saturated | Tìm khách, triển khai | **Ban acc, pháp lý** | ISP policy, pháp lý |
| **Lock-in / bảo trì** | Low (local-first) | Trung (client support) | Cao (tool + proxy chạy tiếp) | Low |
| **Tầm nhìn 10 năm** | Brand content + product hóa tool | Dịch vụ AI local là trend dài | Càng ngày càng bị siết | Càng ngày càng bị siết |

---

## 5. Khuyến nghị (Recommendation)

### Chiến lược tổng: **"AI Video Factory làm mặt trận, AI Service làm hậu thuẫn"**

Chọn **kết hợp A + B làm trục chính**, C và D loại bỏ hoặc giữ ở mức tối thiểu:

1. **Ưu tiên 1 — Lắp và vận hành máy Xeon+MI50 như "xưởng render + inference server"**:
   - OS: Ubuntu 24.04 (nhất quán với .227); ROCm 5.7 (bản cuối hỗ trợ gfx906 đầy đủ) hoặc Docker image gfx906 cộng đồng cho ComfyUI [2][17]
   - RAM: 64-128GB DDR4 (rẻ) — quan trọng cho T5 offload (Wan2.1-14B/FLUX GGUF cần 24-32GB RAM)
   - Lắp quạt đối lưu mạnh cho MI50 passive + airflow case
   - Benchmark trước khi dùng: chạy ComfyUI SDXL + Wan2.1-1.3B + LTX để xác định tốc độ thực (nghiệm thu đo được, không "hy vọng chạy")
2. **Ưu tiên 2 — Vận hành AI Video Factory (A)**:
   - Dùng MovieMaker 13 pipelines + SlncTrZ_VMK (gen qua web miễn phí) + Omnivoice (dub đa ngôn ngữ) trên .171, chuyển render nặng sang máy Xeon
   - Chọn niche "hybrid": narrative documentary, specialized education, deep-dive analysis (finance/tech — RPM $15-45) — **tránh** top-10 list, motivation, AI news aggregation [8]
   - Batch shorts 5-20 video/ngày, human review ở checkpoint, đo retention để chỉnh
3. **Ưu tiên 3 — Bán AI Service cho SME (B) — thu nhập chính dài hạn**:
   - Đóng gói: Ollama multi-model + RAG + n8n + tunnel cloudflared (đã có sẵn hạ tầng!) → "private AI box" $2.5K-15K cho luật/y tế/bất động sản VN
   - Tận dụng kinh nghiệm fine-tune Qwen3 tiếng Việt làm điểm khác biệt
   - Song song: Ollama rental $5-15/tháng × 10-20 khách cho thu nhập định kỳ
4. **Loại bỏ/giảm thiểu**:
   - Bán bandwidth: chỉ cài Honeygain trên máy luôn bật rẻ tiền (không phải Xeon) — hoặc bỏ
   - Nuôi acc FB: không làm tool nuôi hàng loạt; chỉ nuôi acc chính chủ phục vụ content của chính mình

→ Chốt quyết định: **chờ Anh duyệt** để tạo ADR chi tiết cho từng hướng (ADR-2026-08-13-A-video-factory, ADR-2026-08-13-B-ai-service). Chưa lắp máy vội — có thể chạy thử nghiệm ComfyUI trên .171 (RTX 3060) trước để đo chất lượng pipeline.

---

## 6. Kết luận

Máy Xeon 2680 v4 + MI50 là khoản đầu tư đúng hướng cho **AI video production và inference service** — không phải để nuôi acc hay bán bandwidth (hai hướng này không tận dụng được phần cứng và rủi ro cao). Lợi thế lớn nhất của Anh là **stack AI content đã xây xong** (MovieMaker + VMK + Omnivoice + finetune), chỉ cần thêm "xưởng render" này là thành hệ thống factory hoàn chỉnh. Hướng thu nhập chính bền vững là bán dịch vụ AI local cho SME Việt Nam, lấy video content làm kênh marketing + nguồn thu phụ.

*Tái kiểm tra khi: lắp máy xong (benchmark thực tế), YouTube policy cập nhật tiếp, ROCm có bản hỗ trợ gfx906 tốt hơn.*

---

## Nguồn (link)

[1] https://rocm.docs.amd.com/projects/install-on-linux/en/docs-6.3.3/reference/system-requirements.html
[2] https://github.com/ROCm/ROCm/releases/tag/rocm-6.0.0 · https://diegostrebel.com/posts/instinct_mi_50/
[3] https://willitrunai.com/video-models/wan-video-2-1-14b · https://willitrunai.com/blog/wan-2-2-vram-requirements
[4] https://docs.clore.ai/guides/comparisons/video-gen-comparison
[5] H:\Develop\MovieMaker\README.md · MOVIEMAKER_PROPOSAL.md
[6] H:\Develop\SlncTrZ_VMK\README.md
[7] https://kompozy.io/ai-content/faceless-youtube
[8] https://aivideobootcamp.com/blog/how-to-make-money-faceless-youtube-ai/ · https://lumigen.app/blog/faceless-youtube-channel-ai-2026/
[9] https://www.honeygain.com/sell-internet-data/ · https://caproxy.com/en/blog/sell-internet-bandwidth/
[10] https://zingserver.com/nuoi-acc-facebook-tu-dong-tren-vps-python-selenium/ · https://mktsoftware.vn/phan-mem-vuot-checkpoint-facebook
[11] https://betonai.net/how-to-build-a-5k-20k-month-private-ai-installation-business-in-2026-the-privacy-first-gold-rush-complete-setup-pricing-and-client-acquisition-guide/
[12] https://markaicode.com/ai-agent-income-stream-ollama-rental-revenue/
[13] H:\Develop\Training\2026.08.12_Bao_cao_danh_gia_finetune.md
[14] https://www.cpubenchmark.net/cpu.php?cpu=Intel+Xeon+E5-2680+v4+%40+2.40GHz&cpuCount=2 · https://www.pugetsystems.com/pugetbench/results/profile/c821fa74-d35b-11ef-a4e4-bc241170a2bb/
[15] https://www.techpowerup.com/gpu-specs/radeon-instinct-mi50.c3335 · https://www.amd.com/en/products/specifications/accelerators.html
[16] https://www.youtube.com/watch?v=7FtU7t1KUNg
[17] https://github.com/Comfy-Org/ComfyUI/issues/2096
[18] https://forums.unraid.net/topic/97358-whats-your-idle-power-consumption/
[19] https://virvid.ai/blog/monetize-faceless-ai-content-complete-guide-2026 · https://launchtoolsai.com/tutorials/ai-video-automation-income-2026
[20] https://blog.bunnyhoneyclub.com/posts/content-automation-system-1-billion-views
[21] https://dev.to/tamayerd/how-much-i-made-from-ai-generated-videos-real-numbers-24c8 · https://www.usekineo.com/state-of-ai-shorts-2026
[22] https://24hmoney.vn/news/tool-nuoi-nick-facebook-co-that-su-hieu-qua-c53a2452605.html

---

*Ngày cập nhật cuối: 2026-08-13*
