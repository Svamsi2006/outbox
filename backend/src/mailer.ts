import nodemailer from 'nodemailer';

let etherealAccount: nodemailer.TestAccount | null = null;
let cachedTransporter: nodemailer.Transporter | null = null;

export async function getTransporter(sender?: {
  host?: string;
  port?: number;
  user?: string | null;
  pass?: string | null;
}) {
  // If sender has credentials provided, use them
  if (sender?.user && sender?.pass) {
    return nodemailer.createTransport({
      host: sender.host || 'smtp.ethereal.email',
      port: sender.port || 587,
      auth: {
        user: sender.user,
        pass: sender.pass,
      },
    });
  }

  // Otherwise, use cached or generate a new Ethereal test account
  if (!cachedTransporter) {
    if (!etherealAccount) {
      console.log('[Mailer] Creating dynamic Ethereal test account...');
      etherealAccount = await nodemailer.createTestAccount();
      console.log(`[Mailer] Ethereal account ready: ${etherealAccount.user}`);
    }

    cachedTransporter = nodemailer.createTransport({
      host: etherealAccount.smtp.host,
      port: etherealAccount.smtp.port,
      secure: etherealAccount.smtp.secure,
      auth: {
        user: etherealAccount.user,
        pass: etherealAccount.pass,
      },
    });
  }

  return cachedTransporter;
}

export async function sendEmail({
  from,
  to,
  subject,
  html,
  sender,
}: {
  from: string;
  to: string;
  subject: string;
  html: string;
  sender?: {
    host?: string;
    port?: number;
    user?: string | null;
    pass?: string | null;
  };
}) {
  const transporter = await getTransporter(sender);

  const info = await transporter.sendMail({
    from: `ReachInbox Scheduler <${from}>`,
    to,
    subject,
    html,
  });

  const previewUrl = nodemailer.getTestMessageUrl(info);

  return {
    messageId: info.messageId,
    previewUrl: previewUrl || undefined,
  };
}
