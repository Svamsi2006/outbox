import axios from 'axios';
import { prisma } from './prisma';

export async function sendSlackRateLimitNotification({
  senderEmail,
  recipientEmail,
  hourlyLimit,
  delayedUntil,
}: {
  senderEmail: string;
  recipientEmail: string;
  hourlyLimit: number;
  delayedUntil: Date;
}) {
  try {
    const user = await prisma.user.findFirst({
      where: {
        slackConnected: true,
        slackWebhookUrl: { not: null },
      },
    });

    if (!user || !user.slackWebhookUrl) {
      console.log('[Slack] Rate limit hit, but no Slack webhook connected. Skipping alert.');
      return false;
    }

    const payload = {
      text: `🚨 *ReachInbox Rate Limit Alert* 🚨\n*Sender:* \`${senderEmail}\` has hit its hourly limit of *${hourlyLimit} emails/hour*.\n*Delayed Job:* Email to \`${recipientEmail}\` has been rescheduled to \`${delayedUntil.toISOString()}\`.\n*Queue Status:* Safe, zero emails dropped.`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '⚠️ ReachInbox Scheduler: Rate Limit Exceeded',
            emoji: true,
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Sender:*\n${senderEmail}`,
            },
            {
              type: 'mrkdwn',
              text: `*Hourly Limit:*\n${hourlyLimit} emails/hr`,
            },
            {
              type: 'mrkdwn',
              text: `*Affected Recipient:*\n${recipientEmail}`,
            },
            {
              type: 'mrkdwn',
              text: `*Rescheduled Window:*\n${delayedUntil.toLocaleTimeString()}`,
            },
          ],
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: '🛡️ *BullMQ Persistence:* Jobs safely postponed to next window without dropping.',
            },
          ],
        },
      ],
    };

    const res = await axios.post(user.slackWebhookUrl, payload, { timeout: 6000 });
    console.log('[Slack] Rate limit alert dispatched successfully:', res.status);
    return true;
  } catch (err: any) {
    console.error('[Slack] Failed to dispatch webhook alert:', err.message);
    return false;
  }
}

export async function sendSlackTestPing(webhookUrl: string) {
  const payload = {
    text: '✅ *ReachInbox Slack Integration Connected!* Your email scheduler will notify this channel whenever hourly rate limits are reached.',
  };
  return axios.post(webhookUrl, payload, { timeout: 6000 });
}
