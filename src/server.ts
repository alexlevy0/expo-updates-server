import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import { config } from './config';
import { apiLimiter, manifestLimiter, uploadLimiter } from './middleware/rate-limit';
import { errorHandler } from './middleware/error-handler';
import { adminAuth } from './middleware/auth';
import expoRoutes from './routes/expo';
import releaseRoutes from './routes/releases';
import channelRoutes from './routes/channels';
import uploadRoutes from './routes/upload';
import statsRoutes from './routes/stats';

const app = express();

// Security Headers
app.use(helmet({
  contentSecurityPolicy: false, 
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
// Apply specific limiter for manifest
app.use('/api/manifest', manifestLimiter);

app.use('/', expoRoutes); 

// Admin Routes (Dashboard + Upload + Management) - Protected by API Key or Dashboard Auth
app.use('/api/releases/upload', uploadLimiter);
app.use('/api/releases', adminAuth, uploadRoutes); 
app.use('/api/releases', adminAuth, releaseRoutes);
app.use('/api/channels', adminAuth, channelRoutes);

app.use('/api/stats', statsRoutes);

// Dashboard Static
const dashboardDir = path.join(__dirname, '../dashboard'); 
app.use('/dashboard', adminAuth, express.static(dashboardDir));

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
