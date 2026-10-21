#!/usr/bin/env sh
# Run ON THE SERVER (192.168.1.116) from the project folder.
# First time:  git clone https://github.com/mohamedstar19/Darwish_Music_Studio.git && cd Darwish_Music_Studio
#              cp .env.example .env   (then edit the secrets)
# Every update: ./scripts/deploy.sh
set -eu

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Missing .env. Copy .env.example to .env and fill in the secrets first." >&2
  exit 1
fi

git pull --ff-only
mkdir -p "$(grep -E '^MEDIA_PATH=' .env | cut -d= -f2- || echo ./data/media)" 2>/dev/null || true

PROFILE=""
if grep -qE '^CLOUDFLARE_TUNNEL_TOKEN=.+' .env; then
  PROFILE="--profile tunnel"
fi

# shellcheck disable=SC2086
docker compose $PROFILE up -d --build
docker image prune -f >/dev/null

echo "Waiting for the app to become healthy..."
PORT="$(grep -E '^APP_PORT=' .env | cut -d= -f2- || true)"
PORT="${PORT:-8095}"
for _ in $(seq 1 30); do
  if wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1 || curl -fs "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
    echo "Darwish Music Studio is up on port ${PORT}."
    exit 0
  fi
  sleep 2
done
echo "App did not become healthy. Check: docker compose logs app" >&2
exit 1
