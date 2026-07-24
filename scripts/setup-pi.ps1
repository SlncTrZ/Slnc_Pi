<#
.SYNOPSIS
    Pi Zero-to-Hero Setup Script — Windows 11
.DESCRIPTION
    Cài đặt Pi Coding Agent từ đầu với đầy đủ packages, configs,
    và Slnc_Pi extensions/skills sau khi cài lại Windows.
    Chạy với quyền Administrator.
#>

$ErrorActionPreference = "Stop"
$PI_AGENT_DIR = "$env:USERPROFILE\.pi\agent"
$SLNC_PI_DIR = "$env:USERPROFILE\.pi\agent\git\github.com\SlncTrZ\Slnc_Pi"

Write-Host "╔═══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║    Pi Coding Agent — Full Setup (Win 11)  ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════╝" -ForegroundColor Cyan

# ─── Step 1: Prerequisites ─────────────────────────────────
Write-Host "`n[1/7] Kiểm tra prerequisites..." -ForegroundColor Yellow

# Node.js
try {
    $nodeVer = node --version
    Write-Host "  ✓ Node.js: $nodeVer" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Node.js chưa cài. Tải từ https://nodejs.org (22 LTS)" -ForegroundColor Red
    exit 1
}

# Git
try {
    $gitVer = git --version
    Write-Host "  ✓ Git: $gitVer" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Git chưa cài. Tải từ https://git-scm.com" -ForegroundColor Red
    exit 1
}

# ─── Step 2: Install Pi ────────────────────────────────────
Write-Host "`n[2/7] Cài Pi Coding Agent v0.82.0..." -ForegroundColor Yellow
npm install -g @earendil-works/pi-coding-agent@0.82.0
if ($LASTEXITCODE -ne 0) { throw "npm install pi failed" }
Write-Host "  ✓ Pi installed" -ForegroundColor Green

# ─── Step 3: Install global packages ───────────────────────
Write-Host "`n[3/7] Cài npm global packages..." -ForegroundColor Yellow
$globalPkgs = @(
    "@ast-grep/cli@0.44.0",
    "@modelcontextprotocol/server-memory@2026.1.26",
    "mcp-proxy@6.4.5"
)
foreach ($pkg in $globalPkgs) {
    npm install -g $pkg
    Write-Host "  ✓ $pkg" -ForegroundColor Green
}

# ─── Step 4: Install Pi packages ───────────────────────────
Write-Host "`n[4/7] Cài Pi packages (extensions/tools)..." -ForegroundColor Yellow
$piPkgs = @(
    "@narumitw/pi-goal",
    "pi-lens",
    "pi-ultra-compact",
    "@quintinshaw/pi-dynamic-workflows",
    "pi-web-access",
    "pi-btw",
    "pi-lean-ctx",
    "pi-plan",
    "@heyhuynhgiabuu/pi-pretty"
)
foreach ($pkg in $piPkgs) {
    pi install npm:$pkg 2>$null
    Write-Host "  ✓ pi install $pkg" -ForegroundColor Green
}

# ─── Step 5: Clone & install Slnc_Pi ───────────────────────
Write-Host "`n[5/7] Clone Slnc_Pi repo..." -ForegroundColor Yellow
$repoDir = Split-Path $SLNC_PI_DIR -Parent
if (-not (Test-Path $repoDir)) {
    New-Item -ItemType Directory -Path $repoDir -Force | Out-Null
}

if (Test-Path $SLNC_PI_DIR) {
    Write-Host "  → Slnc_Pi đã tồn tại, pull update..." -ForegroundColor Gray
    Push-Location $SLNC_PI_DIR
    git pull origin master
    Pop-Location
} else {
    Push-Location $repoDir
    git clone https://github.com/SlncTrZ/Slnc_Pi.git
    Pop-Location
}

Push-Location $SLNC_PI_DIR
npm install
pi install .
Pop-Location
Write-Host "  ✓ Slnc_Pi installed" -ForegroundColor Green

# ─── Step 6: Restore config ────────────────────────────────
Write-Host "`n[6/7] Restore Pi config..." -ForegroundColor Yellow

# Backup current config first
$backupDir = "$PI_AGENT_DIR/../pi-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
if (Test-Path $PI_AGENT_DIR) {
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    Copy-Item "$PI_AGENT_DIR/*.json" $backupDir -Filter *.json
    Copy-Item "$PI_AGENT_DIR/*.md" $backupDir -Filter *.md
    Write-Host "  ✓ Config backed up to: $backupDir" -ForegroundColor Gray
}

# Restore from Slnc_Pi config backup
$configFiles = @(
    "settings.json", "models.json", "mcp.json",
    "notification.json", "voice-input.json", "trust.json",
    "AGENTS.md", "APPEND_SYSTEM.md"
)

foreach ($file in $configFiles) {
    $src = "$SLNC_PI_DIR/pi-config/$file"
    $dst = "$PI_AGENT_DIR/$file"
    if (Test-Path $src) {
        Copy-Item $src $dst -Force
        Write-Host "  ✓ $file" -ForegroundColor Green
    }
}

# Restore auth.json từ secrets (nếu có)
$authSecret = "$SLNC_PI_DIR/pi-config/secrets/auth.json"
if (Test-Path $authSecret) {
    Copy-Item $authSecret "$PI_AGENT_DIR/auth.json" -Force
    Write-Host "  ✓ auth.json (secrets)" -ForegroundColor Green
} else {
    Write-Host "  ! auth.json không tìm thấy trong secrets/" -ForegroundColor Yellow
    Write-Host "  → Copy thủ công hoặc dùng file example để điền key" -ForegroundColor Gray
}

# ─── Step 7: Verify ────────────────────────────────────────
Write-Host "`n[7/7] Verify installation..." -ForegroundColor Yellow

pi --version
pi status 2>$null

Write-Host "`n╔═══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║       SETUP HOÀN TẤT!                     ║" -ForegroundColor Cyan
Write-Host "║       Chạy 'pi' để bắt đầu                ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════╝" -ForegroundColor Cyan

Write-Host "`n📌 Các bước thủ công còn lại:" -ForegroundColor Magenta
Write-Host "  1. Cài Chafa (emote images): winget install hpjansson.Chafa" -ForegroundColor Gray
Write-Host "  2. Cài Python nếu dùng voice-input: winget install Python.Python.3.12" -ForegroundColor Gray
Write-Host "  3. SSH key vào server .227: ssh-copy-id dinhtc@192.168.1.227" -ForegroundColor Gray
Write-Host "  4. Chạy pi -> /reload -> kiểm tra MCP kết nối" -ForegroundColor Gray
