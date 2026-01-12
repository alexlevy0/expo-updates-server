import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

/**
 * Middleware to authenticate requests via API Key (CI/CD) or Basic Auth (Dashboard).
 * If API Key is provided and matches, request is allowed.
 * Fallback to Basic Auth if configured.
 */
export function adminAuth(req: Request, res: Response, next: NextFunction) {
  // 1. Check API Key (X-API-Key header)
  const configuredApiKey = config.server.apiKey;
  if (configuredApiKey) {
    const requestApiKey = req.headers['x-api-key'];
    if (requestApiKey === configuredApiKey) {
      return next();
    }
    // If API key header is present but invalid, should we fail strictly? 
    // Or allow falling back to Basic Auth?
    // Usually if someone tries API key and fails, it's a 403. 
    // But let's check Basic Auth too, maybe they are using a browser with x-api-key header extension (unlikely).
    // Let's assume if API Key is wrong, we fail? 
    // Or just treat it as "not authenticated via API Key" and try next method.
    // For simplicity: Try API key. If match -> pass. If not match (but present) -> fail? 
    // Let's just check if it matches.
  }

  // 2. Check Dashboard Basic Auth
  if (config.security.dashboard.authEnabled) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Basic ')) {
        const credentials = Buffer.from(authHeader.slice(6), 'base64').toString();
        const [username, password] = credentials.split(':');
        if (username === config.security.dashboard.username && 
            password === config.security.dashboard.password) {
            return next();
        }
    }
  }

  // 3. Fallback: If Basic Auth is disabled and no API key is enforced, allow access?
  // If API Key is configured, we might assume it's required for critical ops.
  // But if API Key is NOT configured, and Basic Auth is NOT enabled, we should allow.
  if (!config.security.dashboard.authEnabled && !configuredApiKey) {
      return next();
  }

  // 4. If neither, determine response
  if (config.security.dashboard.authEnabled) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Expo Updates Server Dashboard"');
  }
  
  return res.status(401).json({ error: 'Authentication required' });
}
