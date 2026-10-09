import cors from 'cors';
import express from 'express';
import type { Container } from './container.js';
import { errorHandler } from './middleware/error-handler.js';
import { createApiRouter } from './routes/index.js';

export function createApp(container: Container) {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.use('/api', createApiRouter(container));
  app.use(errorHandler);
  return app;
}
