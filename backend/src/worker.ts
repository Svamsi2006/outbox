import { Worker, Job } from 'bullmq';
import { redisConnection } from './redis';
import { prisma } from './prisma';
import { sendEmail } from './mailer';
import { sendSlackRateLimitNotification } from './slack';
import { EMAIL_QUEUE_NAME, EmailJobData, addEmailJobToQueue } from './queue';

const WORKER_CONCURRENCY = Number(process.env.WORKER_CONCURRENCY) || 5;

// Helper to calculate current hour window key (UTC or epoch hour)
function getHourWindowKey(senderId: string): { key: string; nextHourTimestamp: number } {
  const now = Date.now();
  const currentHourIndex = Math.floor(now / 3600000);
  const nextHourTimestamp = (currentHourIndex + 1) * 3600000;
  return {
    key: `ratelimit:${senderId}:${currentHourIndex}`,
    nextHourTimestamp,
  };
}

export async function processEmailJob(job: Job<EmailJobData>) {
  const { jobRecordId, senderId, recipientEmail, subject, body } = job.data;
  console.log(`[Worker] Processing Job ${job.id} for ${recipientEmail}`);

  // Fetch job record and sender from DB
  const emailRecord = await prisma.emailJob.findUnique({
    where: { id: jobRecordId },
    include: { sender: true },
  });

  if (!emailRecord) {
    console.warn(`[Worker] Record not found in DB for job ${jobRecordId}. Skipping.`);
    return;
  }

  // Idempotency: Never re-send an email that was already sent
  if (emailRecord.status === 'SENT') {
    console.log(`[Worker] Job ${jobRecordId} is already marked SENT. Skipping.`);
    return;
  }

  const sender = emailRecord.sender;
  const hourlyLimit = sender.hourlyLimit || 100;
  const minDelayMs = (sender.minDelaySeconds || 2) * 1000;

  // 1. Rate Limiting Check via Redis atomic counter
  const { key: rateLimitKey, nextHourTimestamp } = getHourWindowKey(senderId);

  // Increment counter atomically
  const currentHourlyCount = await redisConnection.incr(rateLimitKey);
  if (currentHourlyCount === 1) {
    // Set 2 hour TTL on first increment so keys clean up automatically
    await redisConnection.expire(rateLimitKey, 7200);
  }

  if (currentHourlyCount > hourlyLimit) {
    const delayUntilNextHour = Math.max(1000, nextHourTimestamp - Date.now() + 2000);
    const delayedDate = new Date(Date.now() + delayUntilNextHour);

    console.warn(
      `[Worker] ⚠️ Rate limit exceeded for sender ${sender.email} (${currentHourlyCount}/${hourlyLimit}). Rescheduling job to ${delayedDate.toISOString()}`
    );

    // Update status in DB
    await prisma.emailJob.update({
      where: { id: jobRecordId },
      data: {
        status: 'RATE_LIMITED',
        errorMessage: `Hourly rate limit exceeded (${currentHourlyCount}/${hourlyLimit}). Rescheduled for next hour window.`,
      },
    });

    // Trigger Slack notification alert immediately
    await sendSlackRateLimitNotification({
      senderEmail: sender.email,
      recipientEmail,
      hourlyLimit,
      delayedUntil: delayedDate,
    });

    // Push the job back into the BullMQ delayed queue for +1 hour
    await addEmailJobToQueue(job.data, delayUntilNextHour);
    return { status: 'rate_limited', delayedUntil: delayedDate };
  }

  // 2. Minimum Delay Between Each Email (mimics provider throttling)
  if (minDelayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, minDelayMs));
  }

  // 3. SMTP Dispatch via Nodemailer (Ethereal Email)
  try {
    const sendResult = await sendEmail({
      from: sender.email,
      to: recipientEmail,
      subject,
      html: body,
      sender: {
        host: sender.host,
        port: sender.port,
        user: sender.user,
        pass: sender.pass,
      },
    });

    // 4. Update Database Record to SENT with Ethereal Preview URL
    await prisma.emailJob.update({
      where: { id: jobRecordId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        etherealMessageId: sendResult.messageId,
        etherealPreviewUrl: sendResult.previewUrl,
        errorMessage: null,
      },
    });

    console.log(
      `[Worker] ✅ Email sent to ${recipientEmail}. Preview URL: ${sendResult.previewUrl || 'Ethereal'}`
    );

    return {
      status: 'sent',
      messageId: sendResult.messageId,
      previewUrl: sendResult.previewUrl,
    };
  } catch (error: any) {
    console.error(`[Worker] ❌ Failed to send email to ${recipientEmail}:`, error.message);

    await prisma.emailJob.update({
      where: { id: jobRecordId },
      data: {
        status: 'FAILED',
        errorMessage: error.message,
      },
    });

    throw error;
  }
}

export function startWorker() {
  console.log(`[Worker] Starting BullMQ Worker with concurrency = ${WORKER_CONCURRENCY}...`);

  const worker = new Worker<EmailJobData>(EMAIL_QUEUE_NAME, processEmailJob, {
    connection: redisConnection,
    concurrency: WORKER_CONCURRENCY,
  });

  worker.on('ready', () => {
    console.log('[Worker] Worker connected and listening for jobs.');
  });

  worker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} completed.`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}

// Standalone execution when run via `npm run worker`
if (require.main === module) {
  startWorker();
}
