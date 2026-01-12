import rateLimit from 'express-rate-limit';
import { config } from '../config';

// API générale
export const apiLimiter = rateLimit({
  windowMs: config.security.rateLimitWindowMs,
  max: config.security.rateLimitMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Manifest endpoint (plus permissif - appelé souvent par les apps)
export const manifestLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // 120 req/min par IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(204).end(); // Silent fail pour ne pas bloquer l'app
  },
});

// Upload (restrictif)
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 20, // 20 uploads par heure
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Upload limit exceeded. Try again later.' },
});
