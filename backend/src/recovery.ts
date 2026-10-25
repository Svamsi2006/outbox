import { prisma } from './prisma';
import { emailQueue, addEmailJobToQueue } from './queue';

export async function recoverPendingJobs() {
  try {
    console.log('[Recovery] Checking for unqueued or pending scheduled jobs across restarts...');

    // Fetch jobs that are scheduled for the future or currently pending/queued
    const pendingJobs = await prisma.emailJob.findMany({
      where: {
        status: { in: ['PENDING', 'QUEUED', 'RATE_LIMITED'] },
      },
    });

    if (pendingJobs.length === 0) {
      console.log('[Recovery] No orphaned pending jobs found. Queue is clean.');
      return;
    }

    console.log(`[Recovery] Inspecting ${pendingJobs.length} pending jobs...`);

    let restoredCount = 0;
    for (const job of pendingJobs) {
      // Check if job already exists in BullMQ (delayed, waiting, or active)
      const existingBullJob = await emailQueue.getJob(job.id);

      if (!existingBullJob) {
        const now = Date.now();
        const scheduledTime = new Date(job.scheduledAt).getTime();
        const remainingDelay = Math.max(0, scheduledTime - now);

        await addEmailJobToQueue(
          {
            jobRecordId: job.id,
            senderId: job.senderId,
            recipientEmail: job.recipientEmail,
            subject: job.subject,
            body: job.body,
            scheduledAt: job.scheduledAt.toISOString(),
          },
          remainingDelay
        );

        restoredCount++;
      }
    }

    console.log(`[Recovery] Restart recovery complete. Restored ${restoredCount} jobs to BullMQ queue.`);
  } catch (error: any) {
    console.warn('[Recovery] Notice during recovery check:', error.message);
  }
}
