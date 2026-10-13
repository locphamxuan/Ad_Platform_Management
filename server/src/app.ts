import path from 'node:path';
import cors from 'cors';
import express from 'express';
import type { Container } from './container.js';
import { errorHandler } from './middleware/error-handler.js';
import { securityHeaders } from './middleware/security.js';
import { createApiRouter } from './routes/index.js';

export type AppOptions = {
  /** Absolute path of the built client; when set, the SPA is served next to the API. */
  clientDist?: string;
};

export function createApp(container: Container, options: AppOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  // Behind Cloudflare, plain-http visitors must not send passwords unencrypted; local requests are untouched.
  app.use((req, res, next) => {
    if (req.headers['cf-connecting-ip'] && req.headers['x-forwarded-proto'] === 'http') {
      res.redirect(308, `https://${req.headers.host}${req.originalUrl}`);
      return;
    }
    next();
  });
  app.use(securityHeaders);
  app.use(cors());
  app.use(express.json());
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.use('/api', createApiRouter(container));
  if (options.clientDist) {
    const clientDist = path.resolve(options.clientDist);
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    // Client-side routes (/campaigns, /rules…) all load the same shell; unknown /api paths stay JSON 404s.
    app.get(/^(?!\/api(\/|$)).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }
  app.use(errorHandler);
  return app;
}
