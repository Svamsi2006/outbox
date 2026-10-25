import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';

export const senderRouter = Router();

// GET /api/senders
senderRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const senders = await prisma.sender.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ success: true, data: senders });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/senders
senderRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { name, email, host, port, user, pass, hourlyLimit, minDelaySeconds } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Sender name and email are required.' });
    }

    const sender = await prisma.sender.upsert({
      where: { email },
      update: {
        name,
        host: host || 'smtp.ethereal.email',
        port: port ? Number(port) : 587,
        user: user || null,
        pass: pass || null,
        hourlyLimit: hourlyLimit ? Number(hourlyLimit) : 100,
        minDelaySeconds: minDelaySeconds ? Number(minDelaySeconds) : 2,
      },
      create: {
        name,
        email,
        host: host || 'smtp.ethereal.email',
        port: port ? Number(port) : 587,
        user: user || null,
        pass: pass || null,
        hourlyLimit: hourlyLimit ? Number(hourlyLimit) : 100,
        minDelaySeconds: minDelaySeconds ? Number(minDelaySeconds) : 2,
      },
    });

    return res.status(201).json({ success: true, data: sender });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});
