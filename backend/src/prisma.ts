import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export async function ensureDefaultSenderAndUser() {
  try {
    // Ensure default test sender exists
    const existingSender = await prisma.sender.findFirst();
    if (!existingSender) {
      await prisma.sender.create({
        data: {
          name: 'Primary Ethereal Sender',
          email: 'scheduler@reachinbox-demo.com',
          host: 'smtp.ethereal.email',
          port: 587,
          hourlyLimit: 50,
          minDelaySeconds: 2,
        },
      });
      console.log('[DB] Seeded default sender');
    }

    // Ensure default test user exists
    const existingUser = await prisma.user.findFirst();
    if (!existingUser) {
      await prisma.user.create({
        data: {
          email: 'demo@reachinbox.ai',
          name: 'Vamsi Siva Ganesh',
          avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
          slackConnected: false,
        },
      });
      console.log('[DB] Seeded default user');
    }
  } catch (error: any) {
    console.warn('[DB] Auto-seed notice:', error.message);
  }
}
