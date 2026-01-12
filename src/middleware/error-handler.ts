import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  console.error(`[Error] ${req.method} ${req.url}:`, err);

  if (err instanceof z.ZodError) {
    return res.status(400).json({
      error: 'Validation Error',
      details: err.errors,
    });
  }

  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  // Custom errors (extend Error if needed) usually just 500 here unless specific logic.
  
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
}
