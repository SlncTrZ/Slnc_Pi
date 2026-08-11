# sync-config.ps1 — Đồng bộ pi-config/ -> ~/.pi/agent (1 chiều, repo là nguồn chuẩn).
# Wing: pi-config | Topic: sync | Updated: 2026-08-12
#
# Chống drift: repo là SOURCE OF TRUTH. Mọi thay đổi config sửa tại
# <repo>/pi-config/ rồi chạy script này để đẩy ra ~/.pi/agent.
# ⚠️ KHÔNG đồng bộ thư mục secrets/ (auth.json — credentials, không sync tự động).

$ErrorActionPreference = 'Stop'

$src = Join-Path (Join-Path $PSScriptRoot '..') 'pi-config'
$dst = Join-Path (Join-Path $env:USERPROFILE '.pi') 'agent'

# ─── Đảm bảo thư mục đích tồn tại ─────────────────────────
if (-not (Test-Path $dst)) {
    New-Item -ItemType Directory -Path $dst -Force | Out-Null
    Write-Host "Đã tạo thư mục đích: $dst" -ForegroundColor Gray
}

# ─── Danh sách file cần sync (KHÔNG có secrets/) ──────────
$files = @(
    'AGENTS.md',
    'APPEND_SYSTEM.md',
    'README.md',
    'mcp.json',
    'models.json',
    'notification.json',
    'settings.json',
    'trust.json',
    'voice-input.json'
)

foreach ($file in $files) {
    $srcFile = Join-Path $src $file
    $dstFile = Join-Path $dst $file

    # Nguồn thiếu -> cảnh báo và bỏ qua file đó
    if (-not (Test-Path $srcFile)) {
        Write-Warning "Thiếu $file trong $src — bỏ qua"
        continue
    }

    # Bản cũ ở đích -> backup thành <tên>.bak trước khi ghi đè
    if (Test-Path $dstFile) {
        Copy-Item -Path $dstFile -Destination "$dstFile.bak" -Force
    }

    Copy-Item -Path $srcFile -Destination $dstFile -Force
    Write-Host "OK: $file" -ForegroundColor Green
}

# ─── Hoàn tất ─────────────────────────────────────────────
Write-Host ""
Write-Host "Sync hoàn tất — config đã đồng bộ từ repo ra $dst" -ForegroundColor Cyan
Write-Host "Nếu đang chạy Pi, gõ /reload để nạp config mới" -ForegroundColor Yellow
