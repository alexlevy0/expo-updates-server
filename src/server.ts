import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import { config } from './config';
import { apiLimiter, manifestLimiter, uploadLimiter } from './middleware/rate-limit';
import { errorHandler } from './middleware/error-handler';
import { dashboardAuth } from './middleware/auth';
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
app.use('/api/manifest', manifestLimiter); // Apply specific limiter for manifest if handled by expoRoutes with dedicated path, better to mount specific route if possible, but expoRoutes handles it.
// Actually expoRoutes handles /api/manifest inside. So we should probably apply to the route mount.
// But expoRoutes is mounted at root `/`. "app.use('/', expoRoutes)"
// To apply limiter specifically to manifest, we can't easily unless we know the path inside expoRoutes.
// Typically it is `GET /api/manifest`.

// Let's modify how we mount routes to be more explicit or apply middleware globally with path filter
app.use('/api/manifest', manifestLimiter);

app.use('/', expoRoutes); 
app.use('/api/releases', dashboardAuth, releaseRoutes);
app.use('/api/channels', dashboardAuth, channelRoutes);
app.use('/api/stats', statsRoutes); // Stats might be public or protected? Usually public or separate auth. Let's keep public or add auth if desired. Request didn't specify stats auth, but typically dashboard uses it.
// Actually implementation request said "dashboardAuth on routes admin".
// Stats is used by dashboard, so maybe auth? But user didn't explicitly say stats.
// "dashboard/index.html" fetches /api/stats. So if dashboard is authed, stats should be too if called from browser with credentials.
// But Basic Auth header isn't automatically sent by fetch unless configured...
// Wait, if we put Basic Auth on dashboard HTML, browser handles it.
// Fetches from that page will inherit credentials? No, fetch needs `credentials: 'include'`?
// Actually Basic Auth is usually per-request. Browser remembers it for the realm.
// Let's assume stats can be protected too if dashboard uses it.
// Checking user request: "Appliquer sur les routes admin : app.use('/api/releases', ...), app.use('/api/channels', ...), app.use('/dashboard', ...)"
// It didn't mention stats. But I'll leave stats open or assume it's fine.

// Upload
app.use('/api/releases', dashboardAuth); // Auth for upload too since it's under releases path structure (actually releases.ts handles /api/releases/*, upload handles /api/releases/upload specifically via separate router mount?)
// In server.ts original:
// app.use('/api/releases', releaseRoutes);
// app.use('/api/releases', uploadRoutes);

// So we can do:
app.use('/api/releases/upload', uploadLimiter);
app.use('/api/releases', dashboardAuth, uploadRoutes); // Secure upload
app.use('/api/releases', dashboardAuth, releaseRoutes); // Secure releases

// Dashboard Static
const dashboardDir = path.join(__dirname, '../dashboard'); 
app.use('/dashboard', dashboardAuth, express.static(dashboardDir));

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
