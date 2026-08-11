# Report Components — Cú pháp báo cáo nghiên cứu nâng cao

**Wing:** code · **Topic:** research_report · **Updated:** 2026-08-12

> Báo cáo .md viết theo cấu trúc mục 8 (AGENTS.md), **có thể chèn raw HTML components** — pandoc giữ nguyên, CSS trong theme `theme-github-dark.css` style sẵn. Render bằng `scripts/md2html.ps1` với `-Theme theme-github-dark.css` (hoặc random).

---

## 1. KPI Cards — số liệu nổi bật đầu báo cáo

```html
<div class="kpis">
<div class="kpi"><div class="lbl">Tốc độ TB — CPU</div><div class="val" style="color:var(--accent)">38.1 <small>tok/s</small></div><div class="note">i5-8250U · 4C/8T</div></div>
<div class="kpi"><div class="lbl">Tốc độ TB — GPU</div><div class="val" style="color:var(--purple)">24.5 <small>tok/s</small></div><div class="note">940MX · 2GB</div></div>
</div>
```

- `.lbl` — nhãn nhỏ (chữ in hoa, mờ)
- `.val` — số lớn; màu theo nhu cầu: `--accent` (xanh) / `--green` / `--red` / `--orange` / `--purple`
- `.note` — ghi chú nhỏ bên dưới
- Nhiều `.kpi` trong 1 `.kpis` grid — tự chia cột (min 200px)

## 2. Bar Charts — so sánh

```html
<div class="legend"><span><span class="dot" style="background:linear-gradient(90deg,#1f6feb,#58a6ff)"></span>CPU</span><span><span class="dot" style="background:linear-gradient(90deg,#6e40c9,#bc8cff)"></span>GPU</span></div>

<div class="chart-row"><span>Tốc độ (tok/s)</span><div class="bar-bg"><div class="bar cpu" style="width:92%">38.1</div></div><span>tối đa 41.5</span></div>
<div class="chart-row"><span></span><div class="bar-bg"><div class="bar gpu" style="width:59%">24.5</div></div><span></span></div>
```

- `.bar cpu` — gradient xanh · `.bar gpu` — gradient tím
- `width:%` — % so với thang đo · số hiện ngay trong bar
- Cột 3: chú thích "tối đa X" (bỏ trống nếu không cần)

## 3. Prompt Cards — kết quả từng mẫu thử

```html
<div class="prompt">
<div class="prompt-head"><span class="q">P1 · Toán: <code>prompt...</code></span>
<span class="score"><span class="pts" style="color:var(--red)">0/10</span><span class="badge b-red">FAIL</span></span></div>
<div class="prompt-body">
<p>Nội dung phân tích...</p>
</div>
</div>
```

Badges: `b-green` (OK) · `b-red` (FAIL) · `b-orange` (TB) · `b-blue` · `b-purple`
Màu điểm: `--red` / `--orange` / `--green` / `--accent`

## 4. So sánh CPU vs GPU trong prompt

```html
<div class="cols">
<div class="box cpu"><h4>🧠 CPU — 37.5 tok/s</h4><div class="meta">599 tokens · 16.85s</div><pre>output...</pre></div>
<div class="box gpu"><h4>⚡ GPU — 24.5 tok/s</h4><div class="meta">598 tokens · 24.60s</div><pre>output...</pre></div>
</div>
```

## 5. Verdict — kết luận nổi bật

```html
<div class="verdict">
<h3>🏆 Kết luận</h3>
<p>Nội dung kết luận chính...</p>
</div>
```

## 6. Danh sách phân tích

```html
<ul class="analysis">
<li>Điểm 1...</li>
<li>Điểm 2...</li>
</ul>
```

---

## Ghi chú

- Components chỉ có style đẹp trong **`theme-github-dark.css`** — các theme khác chưa có component CSS (chỉ style markdown chuẩn).
- Markdown thường (bảng, code, quote...) vẫn hoạt động xen kẽ với HTML components.
- Xem ví dụ thực tế: `H:/Develop/TheGhost/qwen3_0.6b_benchmark.md` (KPI + charts + legend).
