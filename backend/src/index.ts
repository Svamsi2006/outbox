import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

import { emailQueue } from './queue';
import { emailRouter } from './routes/emails';
import { slackRouter } from './routes/slack';
import { senderRouter } from './routes/senders';
import { ensureDefaultSenderAndUser } from './prisma';
import { recoverPendingJobs } from './recovery';
import { startWorker } from './worker';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 5000;

// Enable CORS & JSON Parsing
app.use(
  cors({
    origin: '*',
    credentials: true,
  })
);
app.use(express.json());

// Bull-Board Dashboard setup for real-time BullMQ queue visibility
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter,
});

app.use('/admin/queues', serverAdapter.getRouter());

// API Routes
app.use('/api/emails', emailRouter);
app.use('/api/slack', slackRouter);
app.use('/api/senders', senderRouter);

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'reachinbox-scheduler-backend',
  });
});

// Boot & Recovery Sequence
async function bootstrap() {
  try {
    await ensureDefaultSenderAndUser();
    await recoverPendingJobs();

    // In local/dev environments, also run the worker in process if enabled
    if (process.env.RUN_WORKER !== 'false') {
      startWorker();
    }

    app.listen(PORT, () => {
      console.log(`[Server] ReachInbox API running on http://localhost:${PORT}`);
      console.log(`[Server] Live BullMQ Dashboard available at http://localhost:${PORT}/admin/queues`);
    });
  } catch (err: any) {
    console.error('[Server] Fatal bootstrap error:', err);
  }
}

bootstrap();

export default app;
