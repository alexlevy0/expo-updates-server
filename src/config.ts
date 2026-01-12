import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (!value) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getIntEnv(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) throw new Error(`Invalid integer for env var ${key}: ${value}`);
  return parsed;
}

export const config = {
  server: {
    port: getIntEnv('PORT', 3000),
    env: getEnv('NODE_ENV', 'development'),
    baseUrl: getEnv('BASE_URL', 'http://localhost:3000'),
    trustProxy: getEnv('TRUST_PROXY', 'false') === 'true',
  },
  paths: {
    dataDir: path.resolve(getEnv('DATA_DIR', 'data')),
    keysDir: path.resolve(getEnv('KEYS_DIR', 'keys')),
  },
  security: {
    corsOrigin: getEnv('CORS_ORIGIN', '*'),
    rateLimitWindowMs: getIntEnv('RATE_LIMIT_WINDOW_MS', 60000),
    rateLimitMaxRequests: getIntEnv('RATE_LIMIT_MAX_REQUESTS', 100),
    dashboard: {
      authEnabled: getEnv('DASHBOARD_AUTH_ENABLED', 'false') === 'true',
      username: getEnv('DASHBOARD_USERNAME', 'admin'),
      password: getEnv('DASHBOARD_PASSWORD', 'changeme'),
    },
  },
  webhooks: {
    onReleaseUrl: process.env.WEBHOOK_ON_RELEASE_URL || null,
    secret: process.env.WEBHOOK_SECRET || null,
  },
  logLevel: getEnv('LOG_LEVEL', 'info'),
};

// Ensure directories exist (simple check, initialization script handles creation)
console.log(`Configuration loaded. Env: ${config.server.env}`);
