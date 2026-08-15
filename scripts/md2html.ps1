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
Write-Host "2/6 Convert bang Pandoc (Docker .227)..." -ForegroundColor Cyan
$cmd = "cd $ComposeDir && docker compose --profile tools run --rm pandoc -s --toc --embed-resources --standalone --toc-depth=2 --syntax-highlighting=tango -c /data/theme.css -f markdown -t html5 $mdName -o $htmlName && sudo chown dinhtc:dinhtc reports/$htmlName"
ssh -o ConnectTimeout=10 $Server $cmd
if ($LASTEXITCODE -ne 0) {
    Write-Error "Pandoc convert that bai (lan dau se pull image ~50MB - cho vai phut). Xem log tren .227."
    exit 1
}
    
# ─── Buoc 3: keo .html ve local ────────────────────────────
Write-Host "3/6 Keo .html ve local..." -ForegroundColor Cyan
scp -o ConnectTimeout=8 "${Server}:$ComposeDir/reports/$htmlName" $htmlLocal
if ($LASTEXITCODE -ne 0) { Write-Error "scp .html ve that bai"; exit 1 }
    
# ─── Buoc 4: chen nut download floating (DLBTN) vao .html ──
# Nut goc phai duoi: click -> menu tai .md / .html qua /download/ (nginx)
Write-Host "4/6 Chen nut download floating..." -ForegroundColor Cyan
$btnSnippet = Join-Path $PSScriptRoot 'download-button.html'
$htmlRaw = [System.IO.File]::ReadAllText($htmlLocal)
if ($htmlRaw -notmatch 'DLBTN') {
    $snippet = [System.IO.File]::ReadAllText($btnSnippet)
    $htmlRaw = $htmlRaw -replace '(</body>)', "$snippet`r`n`$1"
    [System.IO.File]::WriteAllText($htmlLocal, $htmlRaw, [System.Text.UTF8Encoding]::new($false))
    # Push lai len server de web cung co nut
    scp -o ConnectTimeout=8 $htmlLocal "${Server}:$ComposeDir/reports/$htmlName"
    if ($LASTEXITCODE -ne 0) { Write-Warning "Push .html co nut download len .227 that bai - web se khong co nut." }
} else {
    Write-Host "  (da co nut DLBTN - bo qua)" -ForegroundColor DarkGray
}
    
# ─── Buoc 5: cap nhat index.html tren .227 (gen-index.sh) ──
# Luon chay sau khi render de bao cao moi xuat hien tren reports.truongcongdinh.org
Write-Host "5/6 Cap nhat index.html tren .227..." -ForegroundColor Cyan
ssh -o ConnectTimeout=10 $Server "bash $ComposeDir/gen-index.sh"
if ($LASTEXITCODE -ne 0) { Write-Warning "gen-index.sh that bai - index.html co the cu. Xem log tren .227." }
    
# ─── Buoc 6: mo Chrome cho Anh xem ─────────────────────────
Write-Host "6/6 Mo Chrome..." -ForegroundColor Cyan
$fileUri = "file:///" + ($htmlLocal -replace '\\', '/')
Start-Process "chrome.exe" $fileUri
    
Write-Host ""
Write-Host "Xong: $htmlLocal" -ForegroundColor Green
