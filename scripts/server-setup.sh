#!/usr/bin/env bash
# One-time setup of Darwish Music Studio on the home server. Safe to re-run.
set -euo pipefail

APP_DIR="$HOME/apps/Darwish_Music_Studio"
REPO="https://github.com/mohamedstar19/Darwish_Music_Studio.git"

echo "== checks"
command -v docker >/dev/null || { echo "NO_DOCKER"; exit 2; }
docker compose version >/dev/null 2>&1 || { echo "NO_COMPOSE"; exit 2; }
docker ps >/dev/null 2>&1 || { echo "NO_DOCKER_PERMISSION (user not in docker group)"; exit 3; }
command -v git >/dev/null || { echo "NO_GIT"; exit 2; }
if ss -ltn 2>/dev/null | grep -qE ':8095\b'; then echo "PORT_8095_BUSY"; exit 4; fi

echo "== code"
mkdir -p "$HOME/apps"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
else
  git clone "$REPO" "$APP_DIR"
fi
cd "$APP_DIR"

echo "== .env"
if [ ! -f .env ]; then
  rnd() { openssl rand -hex "$1" 2>/dev/null || head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; }
  ADMIN_PW="$(rnd 8)"
  cat > .env <<EOF
POSTGRES_PASSWORD=$(rnd 24)
JWT_SECRET=$(rnd 32)
ADMIN_EMAIL=admin@darwish-tech.com
ADMIN_PASSWORD=$ADMIN_PW
APP_PORT=8095
MEDIA_PATH=./data/media
COOKIE_SECURE=auto
ALLOW_REGISTRATION=true
MAX_UPLOAD_MB=300
AUDIO_BITRATE=192k
CLOUDFLARE_TUNNEL_TOKEN=
EOF
  chmod 600 .env
  echo "ENV_CREATED"
else
  echo "ENV_EXISTS (kept)"
fi
mkdir -p data/media

echo "== deploy"
chmod +x scripts/*.sh
./scripts/deploy.sh
