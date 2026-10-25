import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { sendSlackTestPing } from '../slack';

export const slackRouter = Router();

// GET /api/slack/status
slackRouter.get('/status', async (_req: Request, res: Response) => {
  try {
    const user = await prisma.user.findFirst();
    return res.json({
      connected: !!user?.slackConnected,
      webhookUrl: user?.slackWebhookUrl
        ? `${user.slackWebhookUrl.slice(0, 30)}...`
        : null,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/slack/connect
slackRouter.post('/connect', async (req: Request, res: Response) => {
  try {
    const { webhookUrl } = req.body;

    if (!webhookUrl || !webhookUrl.startsWith('https://hooks.slack.com')) {
      return res.status(400).json({
        error: 'Please provide a valid incoming Slack Webhook URL starting with https://hooks.slack.com',
      });
    }

    // Attempt test ping
    try {
      await sendSlackTestPing(webhookUrl);
    } catch (pingErr: any) {
      return res.status(400).json({
        error: `Failed to ping Slack webhook: ${pingErr.message}`,
      });
    }

    // Save to user
    let user = await prisma.user.findFirst();
    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          slackWebhookUrl: webhookUrl,
          slackConnected: true,
        },
      });
    } else {
      user = await prisma.user.create({
        data: {
          email: 'demo@reachinbox.ai',
          name: 'ReachInbox Admin',
          slackWebhookUrl: webhookUrl,
          slackConnected: true,
        },
      });
    }

    return res.json({
      success: true,
      message: 'Slack webhook connected and verified successfully!',
      connected: true,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/slack/disconnect
slackRouter.post('/disconnect', async (_req: Request, res: Response) => {
  try {
    const user = await prisma.user.findFirst();
    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          slackWebhookUrl: null,
          slackConnected: false,
        },
      });
    }
    return res.json({ success: true, message: 'Slack disconnected.' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});
