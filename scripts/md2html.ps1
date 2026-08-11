# md2html.ps1 — Convert file .md -> .html dep (Pandoc chay Docker tren .227) roi mo Chrome.
# Wing: code | Topic: research_report | Updated: 2026-08-12
#
# Cach dung:  .\scripts\md2html.ps1 .\path\to\report.md
#             .\scripts\md2html.ps1 .\path\to\report.md -Theme theme-neon.css
#   -Theme de trong (mac dinh) = random 1 trong 3: pandoc-report.css | theme-neon.css | theme-paper.css
# Quy trinh:  scp .md + theme.css len .227 -> docker compose run pandoc -> scp .html ve local -> mo Chrome
# Yeu cau:    OpenSSH client (scp/ssh) co san tren Windows 10/11; Docker service `pandoc` trong docker-all compose
#
# Quy tac nghien cuu (AGENTS.md muc 8): .md la ban chinh — .html la ban trinh bay render tu .md.

param(
    [Parameter(Mandatory = $true)]
    [string]$MdPath,

    [string]$Theme = "",  # ten file css trong docs/themes/ — de trong = random 1 trong 3

    [string]$Server = "dinhtc@192.168.1.227",
    [string]$ComposeDir = "/home/dinhtc/docker-all"
)

$ErrorActionPreference = 'Stop'

# ─── Kiem tra file .md ─────────────────────────────────────
if (-not (Test-Path $MdPath)) {
    Write-Error "Khong tim thay file: $MdPath"
    exit 1
}

$mdFull   = (Resolve-Path $MdPath).Path
$mdName   = [System.IO.Path]::GetFileName($mdFull)                          # report.md
$baseName = [System.IO.Path]::GetFileNameWithoutExtension($mdFull)          # report
$mdDir    = [System.IO.Path]::GetDirectoryName($mdFull)

# ─── Theme CSS (docs/themes/) — de trong = random 1 trong 3 ──
$repoRoot = Split-Path -Parent $PSScriptRoot                                # scripts/ -> repo root
$themeDir = Join-Path $repoRoot 'docs\themes'
$themeList = @('theme-github-dark.css', 'pandoc-report.css', 'theme-neon.css', 'theme-paper.css')
if ([string]::IsNullOrWhiteSpace($Theme)) {
    $Theme = $themeList | Get-Random
    Write-Host "Theme ngau nhien: $Theme" -ForegroundColor Magenta
}
$cssLocal = Join-Path $themeDir $Theme
if (-not (Test-Path $cssLocal)) {
    Write-Error ("Khong tim thay theme: {0} - cac theme co: {1} (dung -Theme <ten>)" -f $Theme, ($themeList -join ', '))
    exit 1
}

$htmlName  = "$baseName.html"
$htmlLocal = Join-Path $mdDir $htmlName

# ─── Buoc 1: day .md + theme.css len .227 ──────────────────
Write-Host "1/4 Day file len .227..." -ForegroundColor Cyan
scp -o ConnectTimeout=8 $mdFull  "${Server}:$ComposeDir/reports/"
if ($LASTEXITCODE -ne 0) { Write-Error "scp .md len that bai"; exit 1 }
scp -o ConnectTimeout=8 $cssLocal "${Server}:$ComposeDir/reports/theme.css"
if ($LASTEXITCODE -ne 0) { Write-Error "scp theme.css len that bai"; exit 1 }

# ─── Buoc 2: convert bang Pandoc (Docker .227) ─────────────
Write-Host "2/4 Convert bang Pandoc (Docker .227)..." -ForegroundColor Cyan
$cmd = "cd $ComposeDir && docker compose --profile tools run --rm pandoc -s --toc --embed-resources --standalone --toc-depth=2 --syntax-highlighting=tango -c /data/theme.css -f markdown -t html5 $mdName -o $htmlName"
ssh -o ConnectTimeout=10 $Server $cmd
if ($LASTEXITCODE -ne 0) {
    Write-Error "Pandoc convert that bai (lan dau se pull image ~50MB - cho vai phut). Xem log tren .227."
    exit 1
}

# ─── Buoc 2.5: cat .md sang reports-md/ (luu tru, KHONG len web) ──
Write-Host "2.5/4 Cat .md sang reports-md/ (luu tru)..." -ForegroundColor Cyan
ssh -o ConnectTimeout=10 $Server "mv -f $ComposeDir/reports/$mdName $ComposeDir/reports-md/ 2>/dev/null"

# ─── Buoc 2.6: sinh lai index.html (card grid) ───────────────
Write-Host "2.6/4 Sinh lai index.html (card grid)..." -ForegroundColor Cyan
ssh -o ConnectTimeout=10 $Server "bash $ComposeDir/gen-index.sh"

# ─── Buoc 3: keo .html ve local ────────────────────────────
Write-Host "3/4 Keo .html ve local..." -ForegroundColor Cyan
scp -o ConnectTimeout=8 "${Server}:$ComposeDir/reports/$htmlName" $htmlLocal
if ($LASTEXITCODE -ne 0) { Write-Error "scp .html ve that bai"; exit 1 }

# ─── Buoc 4: mo Chrome cho Anh xem ─────────────────────────
Write-Host "4/4 Mo Chrome..." -ForegroundColor Cyan
$fileUri = "file:///" + ($htmlLocal -replace '\\', '/')
Start-Process "chrome.exe" $fileUri

Write-Host ""
Write-Host "Xong: $htmlLocal" -ForegroundColor Green
