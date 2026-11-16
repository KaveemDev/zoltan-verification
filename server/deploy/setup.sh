#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 droplet. Run as root from the server folder, after
# filling in .env:   cd /opt/zoltan/server && bash deploy/setup.sh
# Installs Node 24, Chrome's libraries and fonts (for PDFs), Caddy (HTTPS), creates the 'zoltan'
# user, installs dependencies, creates the database tables and starts the API as a service.
set -euo pipefail

APP_DIR=$(cd "$(dirname "$0")/.." && pwd)
[ -f "$APP_DIR/.env" ] || { echo "Create $APP_DIR/.env first (cp .env.example .env)"; exit 1; }
API_DOMAIN=$(grep -E '^API_DOMAIN=' "$APP_DIR/.env" | cut -d= -f2- | tr -d '"')
[ -n "$API_DOMAIN" ] || { echo "Set API_DOMAIN in .env first"; exit 1; }

echo "==> System packages and fonts (Noto covers Devanagari and other Indian scripts in names)"
apt-get update
apt-get install -y ca-certificates curl gnupg debian-keyring debian-archive-keyring apt-transport-https \
  fonts-liberation fonts-noto-core

echo "==> Node 24"
if ! node --version 2>/dev/null | grep -q '^v24'; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi

echo "==> Caddy (HTTPS)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update && apt-get install -y caddy
fi

echo "==> App user and files"
id zoltan >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin zoltan
chown -R zoltan:zoltan "$APP_DIR"
chmod 600 "$APP_DIR/.env"

echo "==> Dependencies (also downloads the Chrome build Puppeteer uses)"
sudo -u zoltan -H bash -c "cd '$APP_DIR' && npm ci --omit=dev"
echo "==> Chrome's system libraries"
(cd "$APP_DIR" && npx puppeteer browsers install chrome --install-deps >/dev/null)

echo "==> Database tables"
sudo -u zoltan -H bash -c "cd '$APP_DIR' && npm run db:deploy"
echo "==> Audit-table protection (shared hosts often refuse this; the app works without it)"
sudo -u zoltan -H bash -c "cd '$APP_DIR' && npm run db:protect-audit" || echo "   skipped: the database host doesn't allow triggers"

echo "==> API service and HTTPS"
sed "s|/opt/zoltan/server|$APP_DIR|" "$APP_DIR/deploy/zoltan-api.service" > /etc/systemd/system/zoltan-api.service
systemctl daemon-reload
systemctl enable zoltan-api
systemctl restart zoltan-api
sed "s|api.zoltanvisa.com|$API_DOMAIN|" "$APP_DIR/deploy/Caddyfile" > /etc/caddy/Caddyfile
systemctl reload caddy || systemctl restart caddy

echo
echo "Done. Next:"
echo "  sudo -u zoltan -H bash -c 'cd $APP_DIR && npm run db:seed'    # first admin + agreement template"
echo "  curl https://$API_DOMAIN/health                              # should print {\"ok\":true}"
