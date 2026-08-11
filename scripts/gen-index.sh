#!/bin/bash
# gen-index.sh — Sinh index.html card grid từ reports/*.html
# Wing: ops | Topic: reports | Updated: 2026-08-11
DIR=/home/dinhtc/docker-all/reports
OUT=$DIR/index.html

{
cat <<'HEAD'
<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>📊 MeiLin Reports</title>
<style>
:root{--bg:#0d1117;--card:#161b22;--border:#30363d;--text:#e6edf3;--dim:#8b949e;--accent:#58a6ff}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--text);font-family:"Segoe UI",system-ui,-apple-system,sans-serif;min-height:100vh}
header{padding:40px 24px 12px;text-align:center;border-bottom:1px solid var(--border);background:linear-gradient(180deg,rgba(88,166,255,.06),transparent)}
header h1{font-size:26px;font-weight:700}
header p{color:var(--dim);margin-top:8px;font-size:14px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:16px;padding:28px;max-width:1150px;margin:0 auto}
.card{display:flex;flex-direction:column;background:var(--card);border:1px solid var(--border);border-radius:14px;padding:20px;text-decoration:none;color:var(--text);transition:transform .15s,border-color .15s,box-shadow .15s}
.card:hover{transform:translateY(-3px);border-color:var(--accent);box-shadow:0 8px 24px rgba(88,166,255,.12)}
.icon{font-size:30px;margin-bottom:14px}
.title{font-size:15.5px;font-weight:600;line-height:1.45;word-break:break-word}
.meta{color:var(--dim);font-size:12px;margin-top:12px;display:flex;gap:12px}
.badge{display:inline-block;background:rgba(88,166,255,.14);color:var(--accent);border:1px solid rgba(88,166,255,.3);border-radius:20px;padding:3px 12px;font-size:11px;margin-top:14px;width:fit-content}
footer{text-align:center;color:var(--dim);font-size:12px;padding:20px}
@media(max-width:600px){.grid{padding:16px;grid-template-columns:1fr}header h1{font-size:20px}}
</style>
</head>
<body>
<header>
<h1>📊 Báo cáo — MeiLin</h1>
<p>Báo cáo nghiên cứu &amp; sự cố · tự cập nhật sau mỗi lần render</p>
</header>
<main class="grid">
HEAD

for f in $(ls -1t "$DIR"/*.html 2>/dev/null | grep -v index.html); do
  name=$(basename "$f")
  base="${name%.html}"
  d=""; slug="$base"
  if [[ "$base" =~ ^([0-9]{4}-[0-9]{2}-[0-9]{2})[-_](.*)$ ]]; then
    d="${BASH_REMATCH[1]}"; slug="${BASH_REMATCH[2]}"
  fi
  [ -z "$d" ] && d=$(stat -c '%d-%b-%Y' "$f")
  size=$(stat -c %s "$f")
  if [ "$size" -ge 1048576 ]; then sz=$(awk "BEGIN{printf \"%.1f MB\", $size/1048576}")
  elif [ "$size" -ge 1024 ]; then sz=$(awk "BEGIN{printf \"%.0f KB\", $size/1024}")
  else sz="${size} B"; fi
  title=$(echo "$slug" | tr '_-' ' ')
  echo "<a class=\"card\" href=\"$name\">"
  echo "  <div class=\"icon\">📄</div>"
  echo "  <div class=\"title\">${title^}</div>"
  echo "  <div class=\"meta\"><span>🗓 ${d}</span><span>💾 ${sz}</span></div>"
  echo "  <span class=\"badge\">HTML Report</span>"
  echo "</a>"
done

cat <<'FOOT'
</main>
<footer>Pi · MeiLin Cyber Brain · truongcongdinh.org</footer>
</body>
</html>
FOOT
} > "$OUT"
echo "OK: $OUT ($(ls "$DIR"/*.html 2>/dev/null | grep -vc index.html) reports)"
