#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Tech-V2 Deployment Script for Ubuntu Server
# Usage: ./deploy.sh [first-run|update|down|logs|db-migrate|db-seed|ssl-init|ssl-renew]
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[DEPLOY]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# Check prerequisites
check_prereqs() {
    if ! command -v docker &>/dev/null; then
        err "Docker is not installed. Install it with:"
        echo "  curl -fsSL https://get.docker.com | sh"
        echo "  sudo usermod -aG docker \$USER"
        echo "  # Then log out and back in"
        exit 1
    fi

    if ! docker compose version &>/dev/null; then
        err "Docker Compose V2 is not available. Update Docker."
        exit 1
    fi

    if [ ! -f .env ]; then
        err ".env file not found. Create it from the template:"
        echo "  cp .env.deploy .env"
        echo "  nano .env    # Fill in real values"
        exit 1
    fi
}

# First-time setup: build and start everything, run migrations
first_run() {
    check_prereqs
    log "Building and starting all services..."
    docker compose up -d --build

    log "Waiting for database to be ready..."
    sleep 5

    log "Running Prisma migrations..."
    docker compose exec backend npx prisma migrate deploy

    log "Running database seed (if applicable)..."
    docker compose exec backend npx prisma db seed || warn "Seed skipped or already applied"

    log ""
    log "===================================="
    log "  Deployment complete!"
    log "  Next step: ./deploy.sh ssl-init"
    log "  View logs:  ./deploy.sh logs"
    log "===================================="
}

# Initialize SSL certificate
ssl_init() {
    check_prereqs
    source .env
    export SSL_EMAIL
    log "Initializing SSL certificate..."
    chmod +x init-ssl.sh
    ./init-ssl.sh "$@"
}

# Force SSL renewal
ssl_renew() {
    check_prereqs
    log "Forcing certificate renewal..."
    docker compose run --rm certbot renew --force-renewal
    docker compose exec frontend nginx -s reload
    log "Certificate renewed and Nginx reloaded."
}

# Update: pull latest code, rebuild, and restart
update() {
    check_prereqs
    log "Pulling latest code..."
    git pull

    log "Rebuilding and restarting services..."
    docker compose up -d --build

    log "Running any pending migrations..."
    docker compose exec backend npx prisma migrate deploy

    log "Update complete!"
}

# Stop all services
down() {
    log "Stopping all services..."
    docker compose down
    log "Services stopped."
}

# View logs
logs() {
    docker compose logs -f --tail=100 "$@"
}

# Run database migrations only
db_migrate() {
    check_prereqs
    log "Running Prisma migrations..."
    docker compose exec backend npx prisma migrate deploy
    log "Migrations complete."
}

# Run database seed
db_seed() {
    check_prereqs
    log "Running database seed..."
    docker compose exec backend npx prisma db seed
    log "Seed complete."
}

# Main
case "${1:-help}" in
    first-run)  first_run ;;
    update)     update ;;
    down)       down ;;
    logs)       shift; logs "$@" ;;
    db-migrate) db_migrate ;;
    db-seed)    db_seed ;;
    ssl-init)   shift; ssl_init "$@" ;;
    ssl-renew)  ssl_renew ;;
    *)
        echo "Usage: $0 {first-run|update|down|logs|db-migrate|db-seed|ssl-init|ssl-renew}"
        echo ""
        echo "Commands:"
        echo "  first-run   Build, start, migrate, and seed (initial deployment)"
        echo "  update      Pull git changes, rebuild, and migrate"
        echo "  down        Stop all services"
        echo "  logs        Tail logs (optionally: logs backend | logs frontend | logs db)"
        echo "  db-migrate  Run pending database migrations"
        echo "  db-seed     Run database seed script"
        echo "  ssl-init    Obtain Let's Encrypt SSL certificate (add --staging to test)"
        echo "  ssl-renew   Force-renew SSL certificate"
        ;;
esac
