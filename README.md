# 🚀 Expo Updates Server (Self-Hosted) - Bun Edition

A production-ready, self-hosted implementation of the **Expo Updates Protocol v1**. Created for teams requiring data sovereignty, on-premise hosting, or an alternative to EAS Update.

Powered by **Bun** for high performance.

## Features

- **Protocol Compliant**: 100% compatible with Expo SDK 49+ updates protocol.
- **Sovereign**: SQLite database + Local file storage (No cloud deps).
- **Secure**: Automatic RSA Code Signing & Manifest verification.
- **Dashboard**: Built-in React Admin Dashboard (zero-config).
- **Efficient**: Asset deduplication & optimized delivery.
- **Production Ready**: Rate limiting, Docker containerized, Health checks.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) 1.0+
- `openssl` (optional, for manual key inspection)

### Local Development

1. **Install Dependencies**
   ```bash
   bun install
   ```

2. **Initialize Database**
   ```bash
   bun run db:init
   ```

3. **Generate Signing Keys**
   ```bash
   bun run keys:generate
   ```
   *Creates `keys/private-key.pem` and `keys/certificate.pem`.*

4. **Start Server**
   ```bash
   bun run dev
   ```
   *Access dashboard at http://localhost:3000/*

### Deployment (Docker)

Use the provided `docker-compose.yml` for instant deployment:

```bash
docker-compose up -d
```

The server will automatically generate keys on first run if missing.

## Usage

### 1. Configure your Expo App

Update your `app.json`:

```json
{
  "expo": {
    "updates": {
      "url": "https://your-server.com/api/manifest",
      "enabled": true,
      "checkAutomatically": "ON_LOAD",
      "fallbackToCacheTimeout": 0,
      "codeSigningCertificate": "./assets/certificate.pem",
      "codeSigningMetadata": {
        "keyid": "main",
        "alg": "rsa-v1_5-sha256"
      }
    },
    "runtimeVersion": {
      "policy": "appVersion"
    }
  }
}
```

> **Note**: Copy `keys/certificate.pem` from the server to your app's `assets/` folder.

### 2. Publish an Update

1. **Export from Expo**
   ```bash
   npx expo export --output-dir dist
   cd dist && zip -r ../dist.zip . && cd ..
   ```

2. **Upload to Server**
   Using the built-in CLI script (or via Dashboard UI):
   
   ```bash
   bun run release:create -- --bundle dist.zip --platform ios --runtime 1.0.0 --channel production
   ```

   Arguments:
   - `--bundle`: Path to zipped export
   - `--platform`: `ios` or `android`
   - `--runtime`: Must match `runtimeVersion` in app config
   - `--channel`: default `production`

## Architecture

- **Backend**: Bun + Express 5 + Better-SQLite3
- **Storage**: Local filesystem (`/data/assets`)
- **Security**: RSA-SHA256 Signing (Node-Forge)

### Key Directory Structure

- `data/`: SQLite database and assets storage. **Persist this volume.**
- `keys/`: RSA Private/Public keys. **Back this up securely.**

## API Documentation

- `GET /api/manifest`: Expo Protocol entry point.
- `GET /assets/:hash`: Asset delivery.
- `GET /api/releases`: List releases.
- `POST /api/releases/upload`: Upload new bundle.
- `GET /api/stats`: Server statistics.

## License

MIT
