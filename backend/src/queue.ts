import { Queue } from 'bullmq';
import { redisConnection } from './redis';

export interface EmailJobData {
  jobRecordId: string;
  senderId: string;
  recipientEmail: string;
  subject: string;
  body: string;
  scheduledAt: string;
}

export const EMAIL_QUEUE_NAME = 'email-dispatch-queue';

export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  },
});

export async function addEmailJobToQueue(jobData: EmailJobData, delayMs: number) {
  const effectiveDelay = Math.max(0, delayMs);
  return emailQueue.add(`send-${jobData.jobRecordId}`, jobData, {
    delay: effectiveDelay,
    jobId: jobData.jobRecordId, // Idempotency: BullMQ rejects duplicate job IDs
  });
}
