# md2html.ps1 — Convert file .md -> .html đẹp (Pandoc chạy Docker trên .227) rồi mở Chrome.
# Wing: code | Topic: research_report | Updated: 2026-08-12
#
# Cách dùng:  .\scripts\md2html.ps1 .\path\to\report.md
# Quy trình:  scp .md + theme.css lên .227 -> docker compose run pandoc -> scp .html về local -> mở Chrome
# Yêu cầu:    OpenSSH client (scp/ssh) có sẵn trên Windows 10/11; Docker service `pandoc` trong docker-all compose
#
# Quy tắc nghiên cứu (AGENTS.md mục 8): .md là bản chính — .html là bản trình bày render từ .md.

param(
    [Parameter(Mandatory = $true)]
    [string]$MdPath,

    [string]$Server = "dinhtc@192.168.1.227",
    [string]$ComposeDir = "/home/dinhtc/docker-all"
)

$ErrorActionPreference = 'Stop'

# ─── Kiểm tra file .md ─────────────────────────────────────
if (-not (Test-Path $MdPath)) {
    Write-Error "Không tìm thấy file: $MdPath"
    exit 1
}

$mdFull  = (Resolve-Path $MdPath).Path
$mdName  = [System.IO.Path]::GetFileName($mdFull)                          # report.md
$baseName = [System.IO.Path]::GetFileNameWithoutExtension($mdFull)         # report
$mdDir   = [System.IO.Path]::GetDirectoryName($mdFull)

# CSS theme nằm trong repo Slnc_Pi (docs/themes/pandoc-report.css)
$repoRoot = Split-Path -Parent $PSScriptRoot                               # scripts/ -> repo root
$cssLocal = Join-Path $repoRoot 'docs\themes\pandoc-report.css'
if (-not (Test-Path $cssLocal)) {
    Write-Error "Thiếu theme CSS: $cssLocal"
    exit 1
}

$htmlName  = "$baseName.html"
$htmlLocal = Join-Path $mdDir $htmlName

# ─── Bước 1: đẩy .md + theme.css lên .227 ─────────────────
Write-Host "1/4 Đẩy file lên .227..." -ForegroundColor Cyan
scp -o ConnectTimeout=8 $mdFull  "${Server}:$ComposeDir/reports/"
if ($LASTEXITCODE -ne 0) { Write-Error "scp .md lên thất bại"; exit 1 }
scp -o ConnectTimeout=8 $cssLocal "${Server}:$ComposeDir/reports/theme.css"
if ($LASTEXITCODE -ne 0) { Write-Error "scp theme.css lên thất bại"; exit 1 }

# ─── Bước 2: convert bằng Pandoc (Docker .227) ─────────────
Write-Host "2/4 Convert bằng Pandoc (Docker .227)..." -ForegroundColor Cyan
$cmd = "cd $ComposeDir && docker compose --profile tools run --rm pandoc -s --toc --embed-resources --standalone --toc-depth=2 --syntax-highlighting=tango -c /data/theme.css -f markdown -t html5 $mdName -o $htmlName"
ssh -o ConnectTimeout=10 $Server $cmd
if ($LASTEXITCODE -ne 0) {
    Write-Error "Pandoc convert thất bại (lần đầu sẽ pull image ~50MB — chờ vài phút). Xem log trên .227."
    exit 1
}

# ─── Bước 3: kéo .html về local ───────────────────────────
Write-Host "3/4 Kéo .html về local..." -ForegroundColor Cyan
scp -o ConnectTimeout=8 "${Server}:$ComposeDir/reports/$htmlName" $htmlLocal
if ($LASTEXITCODE -ne 0) { Write-Error "scp .html về thất bại"; exit 1 }

# ─── Bước 4: mở Chrome cho Anh xem ────────────────────────
Write-Host "4/4 Mở Chrome..." -ForegroundColor Cyan
$fileUri = "file:///" + ($htmlLocal -replace '\\', '/')
Start-Process "chrome.exe" $fileUri

Write-Host ""
Write-Host "Xong: $htmlLocal" -ForegroundColor Green
