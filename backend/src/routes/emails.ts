import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../prisma';
import { addEmailJobToQueue } from '../queue';

export const emailRouter = Router();

// POST /api/emails/schedule
emailRouter.post('/schedule', async (req: Request, res: Response) => {
  try {
    const {
      emails,
      subject,
      body,
      senderId: requestedSenderId,
      startTime,
      delayBetweenEmailsSeconds = 2,
      hourlyLimit,
    } = req.body;

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ error: 'Please provide an array of valid email recipients.' });
    }

    if (!subject || !body) {
      return res.status(400).json({ error: 'Subject and Body are required.' });
    }

    // Resolve Sender
    let sender = null;
    if (requestedSenderId) {
      sender = await prisma.sender.findUnique({ where: { id: requestedSenderId } });
    }
    if (!sender) {
      sender = await prisma.sender.findFirst();
    }
    if (!sender) {
      sender = await prisma.sender.create({
        data: {
          name: 'Primary Ethereal Sender',
          email: 'outbox@reachinbox-demo.com',
          hourlyLimit: hourlyLimit || 100,
          minDelaySeconds: delayBetweenEmailsSeconds || 2,
        },
      });
    }

    // If hourly limit was updated in the compose modal, update sender
    if (hourlyLimit && sender.hourlyLimit !== hourlyLimit) {
      sender = await prisma.sender.update({
        where: { id: sender.id },
        data: { hourlyLimit: Number(hourlyLimit) },
      });
    }

    const startTimestamp = startTime ? new Date(startTime).getTime() : Date.now();
    const delayStepMs = Math.max(1, delayBetweenEmailsSeconds) * 1000;

    const scheduledJobs = [];
    const now = Date.now();

    for (let i = 0; i < emails.length; i++) {
      const recipient = emails[i].trim().toLowerCase();
      if (!recipient || !recipient.includes('@')) continue;

      const jobScheduledTime = new Date(startTimestamp + i * delayStepMs);
      const idempotencyKey = crypto
        .createHash('sha256')
        .update(`${sender.id}:${recipient}:${jobScheduledTime.getTime()}:${subject}`)
        .digest('hex');

      // Upsert job record in Database
      const emailRecord = await prisma.emailJob.upsert({
        where: { idempotencyKey },
        update: {},
        create: {
          idempotencyKey,
          senderId: sender.id,
          recipientEmail: recipient,
          subject,
          body,
          scheduledAt: jobScheduledTime,
          status: 'QUEUED',
        },
      });

      // Calculate delay in milliseconds
      const delayMs = Math.max(0, jobScheduledTime.getTime() - now);

      // Add delayed job to BullMQ
      await addEmailJobToQueue(
        {
          jobRecordId: emailRecord.id,
          senderId: sender.id,
          recipientEmail: recipient,
          subject,
          body,
          scheduledAt: jobScheduledTime.toISOString(),
        },
        delayMs
      );

      scheduledJobs.push({
        id: emailRecord.id,
        recipient,
        scheduledAt: jobScheduledTime,
        delayMs,
      });
    }

    return res.status(201).json({
      success: true,
      message: `Successfully scheduled ${scheduledJobs.length} email job(s).`,
      count: scheduledJobs.length,
      sender: sender.email,
      jobs: scheduledJobs,
    });
  } catch (error: any) {
    console.error('[API] Schedule error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// GET /api/emails/scheduled - Retrieve scheduled / queued / delayed emails
emailRouter.get('/scheduled', async (req: Request, res: Response) => {
  try {
    const q = req.query.q as string | undefined;

    const whereClause: any = {
      status: { in: ['PENDING', 'QUEUED', 'RATE_LIMITED'] },
    };

    if (q) {
      whereClause.OR = [
        { recipientEmail: { contains: q, mode: 'insensitive' } },
        { subject: { contains: q, mode: 'insensitive' } },
      ];
    }

    const jobs = await prisma.emailJob.findMany({
      where: whereClause,
      include: { sender: true },
      orderBy: { scheduledAt: 'asc' },
      take: 100,
    });

    return res.json({ success: true, count: jobs.length, data: jobs });
  } catch (error: any) {
    console.error('[API] Fetch scheduled error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/emails/sent - Retrieve sent & failed emails
emailRouter.get('/sent', async (req: Request, res: Response) => {
  try {
    const q = req.query.q as string | undefined;

    const whereClause: any = {
      status: { in: ['SENT', 'FAILED'] },
    };

    if (q) {
      whereClause.OR = [
        { recipientEmail: { contains: q, mode: 'insensitive' } },
        { subject: { contains: q, mode: 'insensitive' } },
      ];
    }

    const jobs = await prisma.emailJob.findMany({
      where: whereClause,
      include: { sender: true },
      orderBy: { sentAt: 'desc' },
      take: 100,
    });

    return res.json({ success: true, count: jobs.length, data: jobs });
  } catch (error: any) {
    console.error('[API] Fetch sent error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/emails/stats - Summary dashboard statistics
emailRouter.get('/stats', async (_req: Request, res: Response) => {
  try {
    const [scheduledCount, sentCount, failedCount, rateLimitedCount] = await Promise.all([
      prisma.emailJob.count({ where: { status: { in: ['PENDING', 'QUEUED'] } } }),
      prisma.emailJob.count({ where: { status: 'SENT' } }),
      prisma.emailJob.count({ where: { status: 'FAILED' } }),
      prisma.emailJob.count({ where: { status: 'RATE_LIMITED' } }),
    ]);

    return res.json({
      success: true,
      stats: {
        scheduled: scheduledCount,
        sent: sentCount,
        failed: failedCount,
        rateLimited: rateLimitedCount,
        total: scheduledCount + sentCount + failedCount + rateLimitedCount,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});
