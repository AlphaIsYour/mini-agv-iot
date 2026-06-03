#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# XORA AGV — VPS Setup Script
# Run this ONCE on your VPS to prepare it for deployment.
# Usage: bash setup-vps.sh
# ═══════════════════════════════════════════════════════════════════════════════

set -e

echo "🚀 XORA AGV — VPS Setup Starting..."
echo "============================================"

# ── 1. Update system ──────────────────────────────────────────────────────────
echo "📦 Updating system packages..."
apt-get update -y && apt-get upgrade -y

# ── 2. Install Docker ─────────────────────────────────────────────────────────
if ! command -v docker &> /dev/null; then
    echo "🐳 Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    echo "✅ Docker installed: $(docker --version)"
else
    echo "✅ Docker already installed: $(docker --version)"
fi

# ── 3. Install Docker Compose ─────────────────────────────────────────────────
if ! docker compose version &> /dev/null; then
    echo "🔧 Installing Docker Compose plugin..."
    apt-get install -y docker-compose-plugin
    echo "✅ Docker Compose installed"
else
    echo "✅ Docker Compose already available: $(docker compose version)"
fi

# ── 4. Create project directory ───────────────────────────────────────────────
PROJECT_DIR="/opt/agv-iot"
echo "📁 Creating project directory at $PROJECT_DIR..."
mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"

# ── 5. Create .env from template if not exists ────────────────────────────────
if [ ! -f .env ]; then
    echo "📝 Creating .env from template..."
    cat > .env << 'ENVEOF'
# ── Server ──────────────────────────────────────────────────────────────────────
PORT=3000
WS_PORT=3001
NODE_ENV=production

# ── Session Secret ──────────────────────────────────────────────────────────────
# Generate: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
SESSION_SECRET=CHANGE_ME_TO_RANDOM_STRING

# ── Auth ────────────────────────────────────────────────────────────────────────
ADMIN_USERNAME=admin
ADMIN_PASSWORD_PLAIN=CHANGE_ME_STRONG_PASSWORD

# ── Database ────────────────────────────────────────────────────────────────────
POSTGRES_USER=user
POSTGRES_PASSWORD=CHANGE_ME_POSTGRES_PASSWORD
POSTGRES_DB=agv_db
DATABASE_URL=postgresql://user:CHANGE_ME_POSTGRES_PASSWORD@postgres:5432/agv_db

# ── MQTT ────────────────────────────────────────────────────────────────────────
MQTT_BROKER=mqtt://mosquitto:1883

# ── CORS ────────────────────────────────────────────────────────────────────────
ALLOWED_ORIGIN=http://YOUR_VPS_IP:3000
ENVEOF
    echo "⚠️  IMPORTANT: Edit /opt/agv-iot/.env and change all CHANGE_ME values!"
else
    echo "✅ .env already exists, skipping..."
fi

# ── 6. Create mosquitto.conf ──────────────────────────────────────────────────
if [ ! -f mosquitto.conf ]; then
    echo "📡 Creating mosquitto.conf..."
    cat > mosquitto.conf << 'MQTTEOF'
listener 1883 0.0.0.0
allow_anonymous true
MQTTEOF
fi

# ── 7. Configure firewall ─────────────────────────────────────────────────────
if command -v ufw &> /dev/null; then
    echo "🔥 Configuring firewall..."
    ufw allow 22/tcp    # SSH
    ufw allow 3000/tcp  # Dashboard
    ufw allow 3001/tcp  # WebSocket
    ufw allow 1883/tcp  # MQTT
    ufw --force enable
    echo "✅ Firewall configured"
else
    echo "⚠️  ufw not found, skipping firewall config"
fi

# ── 8. Create docker-compose.yml (will be replaced by CI/CD) ──────────────────
if [ ! -f docker-compose.yml ]; then
    echo "🐳 Creating docker-compose.yml..."
    cat > docker-compose.yml << 'COMPOSEEOF'
services:
  app:
    image: ghcr.io/alphaisyour/mini-agv-iot:latest
    container_name: agv_bridge_server
    restart: unless-stopped
    ports:
      - "3000:3000"
      - "3001:3001"
    env_file:
      - .env
    depends_on:
      postgres:
        condition: service_healthy
      mosquitto:
        condition: service_started
    networks:
      - agv_network

  postgres:
    image: postgres:15-alpine
    container_name: agv_postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-user}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-password}
      POSTGRES_DB: ${POSTGRES_DB:-agv_db}
    ports:
      - "127.0.0.1:5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    networks:
      - agv_network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-user} -d ${POSTGRES_DB:-agv_db}"]
      interval: 10s
      timeout: 5s
      retries: 5

  mosquitto:
    image: eclipse-mosquitto:2
    container_name: agv_mqtt_broker
    restart: unless-stopped
    ports:
      - "1883:1883"
    volumes:
      - ./mosquitto.conf:/mosquitto/config/mosquitto.conf
      - mosquitto_data:/mosquitto/data
      - mosquitto_log:/mosquitto/log
    networks:
      - agv_network

networks:
  agv_network:
    driver: bridge

volumes:
  pgdata:
  mosquitto_data:
  mosquitto_log:
COMPOSEEOF
fi

echo ""
echo "============================================"
echo "✅ VPS Setup Complete!"
echo "============================================"
echo ""
echo "📋 Next Steps:"
echo "  1. Edit /opt/agv-iot/.env — set your passwords and VPS IP"
echo "  2. Set GitHub Secrets for CI/CD:"
echo "     - VPS_HOST: $(hostname -I | awk '{print $1}')"
echo "     - VPS_PORT: 22"
echo "     - VPS_USER: root"
echo "     - VPS_PASSWORD: your_ssh_password"
echo "  3. Push to master branch to trigger auto-deploy!"
echo ""
echo "🔗 Dashboard will be at: http://$(hostname -I | awk '{print $1}'):3000"
echo ""
