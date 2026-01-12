#!/bin/sh
set -e

echo "🚀 Starting Expo Updates Server..."

# Run DB Migrations
echo "📦 Running Database Migrations..."
bun scripts/init-db.ts

# Generate Keys if missing
if [ ! -f "$KEYS_DIR/private-key.pem" ]; then
    echo "🔑 Generating RSA Keys..."
    bun scripts/generate-keys.ts
fi

# Start Server
echo "✅ Initialization Complete. Starting Server..."
exec bun dist/server.js
