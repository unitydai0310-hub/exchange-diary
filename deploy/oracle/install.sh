#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   sudo bash install.sh <GITHUB_REPO_URL>
# Example:
#   sudo bash install.sh https://github.com/unitydai0310-hub/exchange-diary.git

if [[ $# -lt 1 ]]; then
  echo "Usage: sudo bash install.sh <GITHUB_REPO_URL>"
  exit 1
fi

REPO_URL="$1"
APP_DIR="/opt/exchange-diary"
SERVICE_PATH="/etc/systemd/system/exchange-diary.service"

if [[ -f /etc/debian_version ]]; then
  apt update
  apt -y install curl git ca-certificates
  if ! command -v node >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt -y install nodejs
  fi
else
  echo "This installer currently targets Ubuntu/Debian."
  exit 1
fi

if [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" fetch --all
  git -C "$APP_DIR" reset --hard origin/main
else
  rm -rf "$APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"
npm install --omit=dev
mkdir -p data uploads

cat > "$SERVICE_PATH" <<'UNIT'
[Unit]
Description=Exchange Diary
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/exchange-diary
Environment=NODE_ENV=production
Environment=HOST=0.0.0.0
Environment=PORT=5173
ExecStart=/usr/bin/node /opt/exchange-diary/server.js
Restart=always
RestartSec=3
User=root

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now exchange-diary
systemctl status exchange-diary --no-pager

echo ""
echo "Done. Check health:"
echo "  curl http://127.0.0.1:5173/api/health"
