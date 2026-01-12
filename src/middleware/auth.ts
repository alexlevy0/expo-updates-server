import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export function dashboardAuth(req: Request, res: Response, next: NextFunction) {
  if (!config.security.dashboard.authEnabled) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Expo Updates Dashboard"');
    return res.status(401).json({ error: 'Authentication required' });
  }

  const credentials = Buffer.from(authHeader.slice(6), 'base64').toString();
  const [username, password] = credentials.split(':');

  if (username === config.security.dashboard.username && 
      password === config.security.dashboard.password) {
    return next();
  }

  res.status(401).json({ error: 'Invalid credentials' });
}
