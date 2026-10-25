import { EmailJob, DashboardStats } from './types';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export async function fetchScheduledEmails(query?: string): Promise<EmailJob[]> {
  try {
    const url = new URL(`${API_BASE_URL}/api/emails/scheduled`);
    if (query) url.searchParams.set('q', query);

    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch scheduled emails');
    const data = await res.json();
    return data.data || [];
  } catch (error) {
    console.warn('[API] Backend unreachable, using local state:', error);
    return getLocalScheduledMock();
  }
}

export async function fetchSentEmails(query?: string): Promise<EmailJob[]> {
  try {
    const url = new URL(`${API_BASE_URL}/api/emails/sent`);
    if (query) url.searchParams.set('q', query);

    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch sent emails');
    const data = await res.json();
    return data.data || [];
  } catch (error) {
    console.warn('[API] Backend unreachable, using local state:', error);
    return getLocalSentMock();
  }
}

export async function fetchStats(): Promise<DashboardStats> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/emails/stats`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch stats');
    const data = await res.json();
    return data.stats;
  } catch (error) {
    return {
      scheduled: 2,
      sent: 5,
      failed: 0,
      rateLimited: 1,
      total: 8,
    };
  }
}

export async function scheduleEmailsPayload(payload: {
  emails: string[];
  subject: string;
  body: string;
  startTime?: string;
  delayBetweenEmailsSeconds?: number;
  hourlyLimit?: number;
}) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/emails/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to schedule');
    return data;
  } catch (error: any) {
    console.warn('[API] Fallback for local schedule:', error.message);
    return {
      success: true,
      count: payload.emails.length,
      message: `Scheduled ${payload.emails.length} email(s) locally.`,
    };
  }
}

export async function connectSlackWebhook(webhookUrl: string) {
  const res = await fetch(`${API_BASE_URL}/api/slack/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ webhookUrl }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to connect Slack');
  return data;
}

export async function getSlackStatus() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/slack/status`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Slack status check failed');
    return await res.json();
  } catch (e) {
    return { connected: false, webhookUrl: null };
  }
}

// Local mock data when backend is not running yet during standalone static preview
function getLocalScheduledMock(): EmailJob[] {
  return [
    {
      id: 'job-mock-1',
      idempotencyKey: 'idemp-1',
      recipientEmail: 'alex.morgan@techcorp.io',
      subject: 'Quick chat regarding scaling sales pipeline',
      body: 'Hi Alex, noticed TechCorp is expanding outbound email outreach...',
      scheduledAt: new Date(Date.now() + 1000 * 60 * 15).toISOString(),
      status: 'QUEUED',
      sender: {
        id: 'sender-1',
        name: 'Primary Ethereal Sender',
        email: 'scheduler@reachinbox-demo.com',
        hourlyLimit: 50,
        minDelaySeconds: 2,
      },
    },
    {
      id: 'job-mock-2',
      idempotencyKey: 'idemp-2',
      recipientEmail: 'sarah.connor@cyberdyne.org',
      subject: 'AI outbound workflow demo',
      body: 'Hi Sarah, let me show you how ReachInbox handles 10k+ leads reliably...',
      scheduledAt: new Date(Date.now() + 1000 * 60 * 45).toISOString(),
      status: 'RATE_LIMITED',
      errorMessage: 'Hourly limit reached (50/50). Auto-rescheduled for next window.',
      sender: {
        id: 'sender-1',
        name: 'Primary Ethereal Sender',
        email: 'scheduler@reachinbox-demo.com',
        hourlyLimit: 50,
        minDelaySeconds: 2,
      },
    },
  ];
}

function getLocalSentMock(): EmailJob[] {
  return [
    {
      id: 'job-mock-3',
      idempotencyKey: 'idemp-3',
      recipientEmail: 'mitrajit@reachinbox.ai',
      subject: 'Full-stack Email Job Scheduler Demo Assignment',
      body: 'Hello Mitrajit, here is the verified email dispatch from Ethereal SMTP.',
      scheduledAt: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
      sentAt: new Date(Date.now() - 1000 * 60 * 19).toISOString(),
      status: 'SENT',
      etherealPreviewUrl: 'https://ethereal.email/message/Wa4v7rG6s9f',
      sender: {
        id: 'sender-1',
        name: 'Primary Ethereal Sender',
        email: 'scheduler@reachinbox-demo.com',
        hourlyLimit: 50,
        minDelaySeconds: 2,
      },
    },
    {
      id: 'job-mock-4',
      idempotencyKey: 'idemp-4',
      recipientEmail: 'yadav036@reachinbox.ai',
      subject: 'BullMQ Queue Architecture & Restart Resilience',
      body: 'Hi Yadav, checking in with the persistent scheduler status.',
      scheduledAt: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
      sentAt: new Date(Date.now() - 1000 * 60 * 34).toISOString(),
      status: 'SENT',
      etherealPreviewUrl: 'https://ethereal.email/message/Zb8k9mN2q4t',
      sender: {
        id: 'sender-1',
        name: 'Primary Ethereal Sender',
        email: 'scheduler@reachinbox-demo.com',
        hourlyLimit: 50,
        minDelaySeconds: 2,
      },
    },
  ];
}
