export interface EmailJob {
  id: string;
  idempotencyKey: string;
  recipientEmail: string;
  subject: string;
  body: string;
  scheduledAt: string;
  sentAt?: string | null;
  status: 'PENDING' | 'QUEUED' | 'SENT' | 'FAILED' | 'RATE_LIMITED';
  errorMessage?: string | null;
  etherealPreviewUrl?: string | null;
  etherealMessageId?: string | null;
  sender?: {
    id: string;
    name: string;
    email: string;
    hourlyLimit: number;
    minDelaySeconds: number;
  };
}

export interface DashboardStats {
  scheduled: number;
  sent: number;
  failed: number;
  rateLimited: number;
  total: number;
}

export interface UserProfile {
  name: string;
  email: string;
  avatar: string;
}
