#!/usr/bin/env bash
# Pi Zero-to-Hero Setup Script — Linux / WSL
set -euo pipefail

PI_AGENT_DIR="$HOME/.pi/agent"
SLNC_PI_DIR="$PI_AGENT_DIR/git/github.com/SlncTrZ/Slnc_Pi"

echo "╔═══════════════════════════════════════════╗"
echo "║    Pi Coding Agent — Full Setup (Linux)   ║"
echo "╚═══════════════════════════════════════════╝"

# ─── Step 1: Prerequisites ─────────────────────────────────
echo -e "\n[1/7] Kiểm tra prerequisites..."

command -v node >/dev/null 2>&1 || { echo "✗ Node.js chưa cài. Cài qua nvm hoặc apt"; exit 1; }
echo "  ✓ Node.js: $(node --version)"

command -v git >/dev/null 2>&1 || { echo "✗ Git chưa cài. Cài qua apt: sudo apt install git"; exit 1; }
echo "  ✓ Git: $(git --version)"

# ─── Step 2: Install Pi ────────────────────────────────────
echo -e "\n[2/7] Cài Pi Coding Agent v0.82.0..."
npm install -g @earendil-works/pi-coding-agent@0.82.0
echo "  ✓ Pi installed"

# ─── Step 3: Global packages ───────────────────────────────
echo -e "\n[3/7] Cài npm global packages..."
npm install -g \
  @ast-grep/cli@0.44.0 \
  @modelcontextprotocol/server-memory@2026.1.26 \
  mcp-proxy@6.4.5
echo "  ✓ Global packages installed"

# ─── Step 4: Pi packages ───────────────────────────────────
echo -e "\n[4/7] Cài Pi packages..."
for pkg in \
  "@narumitw/pi-goal" \
  "pi-lens" \
  "pi-ultra-compact" \
  "@quintinshaw/pi-dynamic-workflows" \
  "pi-web-access" \
  "pi-btw" \
  "pi-lean-ctx" \
  "pi-plan" \
  "@heyhuynhgiabuu/pi-pretty"; do
  pi install "npm:$pkg" 2>/dev/null && echo "  ✓ $pkg"
done

# ─── Step 5: Clone Slnc_Pi ─────────────────────────────────
echo -e "\n[5/7] Clone Slnc_Pi..."
repoDir=$(dirname "$SLNC_PI_DIR")
mkdir -p "$repoDir"

if [ -d "$SLNC_PI_DIR" ]; then
  echo "  → Slnc_Pi đã tồn tại, pull update..."
  cd "$SLNC_PI_DIR" && git pull origin master
else
  cd "$repoDir"
  git clone https://github.com/SlncTrZ/Slnc_Pi.git
fi

cd "$SLNC_PI_DIR"
npm install
pi install .
echo "  ✓ Slnc_Pi installed"

# ─── Step 6: Restore config ────────────────────────────────
echo -e "\n[6/7] Restore Pi config..."

backupDir="$HOME/.pi/pi-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backupDir"
[ -d "$PI_AGENT_DIR" ] && cp "$PI_AGENT_DIR"/*.json "$backupDir/" 2>/dev/null || true
echo "  ✓ Config backed up to: $backupDir"

for file in settings.json models.json mcp.json notification.json voice-input.json trust.json AGENTS.md APPEND_SYSTEM.md; do
  src="$SLNC_PI_DIR/pi-config/$file"
  dst="$PI_AGENT_DIR/$file"
  [ -f "$src" ] && cp "$src" "$dst" && echo "  ✓ $file"
done

# Restore auth.json from secrets
if [ -f "$SLNC_PI_DIR/pi-config/secrets/auth.json" ]; then
  cp "$SLNC_PI_DIR/pi-config/secrets/auth.json" "$PI_AGENT_DIR/auth.json"
  echo "  ✓ auth.json (secrets)"
else
  echo "  ! auth.json không tìm thấy trong secrets/"
  echo "  → Copy thủ công hoặc dùng file example để điền key"
fi

# ─── Step 7: Verify ────────────────────────────────────────
echo -e "\n[7/7] Verify..."
pi --version
echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║       SETUP HOÀN TẤT!                     ║"
echo "║       Chạy 'pi' để bắt đầu                ║"
echo "╚═══════════════════════════════════════════╝"
