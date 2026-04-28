#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# SSL Certificate Initialization for schoolworks.ocboe.com
#
# This script handles the chicken-and-egg problem:
#   - Nginx needs certs to start with SSL
#   - Certbot needs Nginx running to complete the ACME challenge
#
# It creates a temporary self-signed cert, starts Nginx, obtains the real
# Let's Encrypt cert, then reloads Nginx.
#
# Usage: ./init-ssl.sh [--staging]   (use --staging for testing to avoid rate limits)
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Load .env if it exists (needed when running under sudo which strips the environment)
if [ -f "$SCRIPT_DIR/.env" ]; then
    set -o allexport
    # shellcheck disable=SC1091
    source "$SCRIPT_DIR/.env"
    set +o allexport
fi

DOMAIN="${DOMAIN:-schoolworks.ocboe.com}"
EMAIL="${SSL_EMAIL:-}"
STAGING="${1:-}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[SSL]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*" >&2; }

if [ -z "$EMAIL" ]; then
    err "SSL_EMAIL is required. Set it in your .env file or export it:"
    echo "  export SSL_EMAIL=you@example.com"
    exit 1
fi

# Check if real certs already exist
if docker compose run --rm certbot certificates 2>/dev/null | grep -q "Certificate Name: $DOMAIN"; then
    log "Certificate for $DOMAIN already exists. Skipping initialization."
    log "To force renewal: docker compose run --rm certbot renew --force-renewal"
    exit 0
fi

log "Initializing SSL for $DOMAIN..."

# Step 1: Create dummy certificate so Nginx can start
log "Step 1/4: Creating temporary self-signed certificate..."
docker compose run --rm --no-deps --entrypoint "" certbot sh -c "
    mkdir -p /etc/letsencrypt/live/$DOMAIN
    openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
        -keyout /etc/letsencrypt/live/$DOMAIN/privkey.pem \
        -out /etc/letsencrypt/live/$DOMAIN/fullchain.pem \
        -subj '/CN=$DOMAIN'
"

# Step 2: Start Nginx with the dummy cert
log "Step 2/4: Starting Nginx with temporary certificate..."
docker compose up -d frontend

# Give Nginx a moment to start
sleep 3

# Step 3: Stop Nginx, remove dummy cert, get real cert via standalone
log "Step 3/4: Requesting Let's Encrypt certificate..."

# Stop nginx so certbot standalone can bind port 80
docker compose stop frontend

# Remove the dummy cert so certbot can write the real one
docker compose run --rm --no-deps --entrypoint "" certbot sh -c "
    rm -rf /etc/letsencrypt/live/$DOMAIN
    rm -rf /etc/letsencrypt/archive/$DOMAIN
    rm -rf /etc/letsencrypt/renewal/$DOMAIN.conf
"

STAGING_FLAG=""
if [ "$STAGING" = "--staging" ]; then
    STAGING_FLAG="--staging"
    warn "Using Let's Encrypt STAGING environment (cert will not be trusted)"
fi

# Use standalone mode - certbot runs its own HTTP server on port 80
# -p 80:80 is required because docker compose run doesn't publish ports by default
docker compose run --rm --no-deps -p 80:80 --entrypoint certbot certbot certonly \
    --standalone \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    -d "$DOMAIN" \
    $STAGING_FLAG

# Step 4: Start Nginx with the real certificate
log "Step 4/4: Starting Nginx with real certificate..."
docker compose up -d frontend

log ""
log "===================================="
log "  SSL setup complete!"
log "  https://$DOMAIN is now active"
log "  Certificate auto-renews via Certbot container"
log "===================================="
