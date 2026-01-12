import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import { config } from './config';
import { apiLimiter } from './middleware/rate-limit';
import { errorHandler } from './middleware/error-handler';

// Route imports
import expoRoutes from './routes/expo';
import releaseRoutes from './routes/releases';
import channelRoutes from './routes/channels';
import uploadRoutes from './routes/upload';
import statsRoutes from './routes/stats';

const app = express();

// Security Headers
app.use(helmet({
  contentSecurityPolicy: false, // Strict CSP might block some dashboard resources (inline scripts) if not careful. default off for now.
}));

// CORS
app.use(cors({ origin: config.security.corsOrigin }));

// Rate Limit
app.use('/api/', apiLimiter);

// Body Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (config.server.trustProxy) {
  app.set('trust proxy', 1);
}

// Routes
app.use('/', expoRoutes); // Root level likely for /assets, or /api/manifest which expoRoutes handles
app.use('/api/releases', releaseRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/stats', statsRoutes);

// Upload routes often need custom body parsing (multipart), so handled inside or attached carefully.
// We'll attach it at proper path.
app.use('/api/releases', uploadRoutes); // e.g. POST /api/releases/upload

// Dashboard Static Files
// If 'dist/dashboard' exists (production), serve it. In dev, we might serve from 'dashboard' dir directly or let user run standard.
// But specs say: "Single HTML file (zero build step)" for dashboard.
// So we serve the static dashboard directory.
const dashboardDir = path.join(__dirname, '../dashboard'); 
// In prod, structure is:
// /app/dist/server.js
// /app/dashboard/index.html
// So relative to dist/server.js, dashboard is ../dashboard (peer)
// In dev: src/server.ts, dashboard is ../dashboard
app.use('/dashboard', express.static(dashboardDir));

// Fallback for SPA routing if we add client-side routing, but it's single index.html
app.get('/dashboard/*', (req, res) => {
  res.sendFile(path.join(dashboardDir, 'index.html'));
});

// Health Check
app.get('/health', (req, res) => {
  // Check DB ?
  try {
    // simple query
    // db.prepare('SELECT 1').run(); 
    // Need to import db carefully or just return 200 for liveness
    res.json({ status: 'ok' });
  } catch (e) {
    res.status(503).json({ status: 'error' });
  }
});

app.get('/ready', (req, res) => {
  res.json({ status: 'ready' });
});

// Redirect root to dashboard?
app.get('/', (req, res) => {
  res.redirect('/dashboard');
});

// Error Handling
app.use(errorHandler);

// Start Server
if (require.main === module) {
  app.listen(config.server.port, () => {
    console.log(`Server running on port ${config.server.port} in ${config.server.env} mode`);
    console.log(`Dashboard available at ${config.server.baseUrl}/dashboard`);
  });
}

export default app;
