import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    // Simulate upsertUser with telegramId as string
    const telegramId = '260990437';
    const user = await prisma.user.upsert({
      where: { telegramId },
      update: {
        firstName: 'Егор',
        lastName: 'Test',
        username: 'egor_test'
      },
      create: {
        telegramId,
        firstName: 'Егор',
        lastName: 'Test',
        username: 'egor_test'
      }
    });

    console.log('User upserted:', JSON.stringify(user, null, 2));

    // Query all users
    const allUsers = await prisma.user.findMany();
    console.log('\nAll users:', JSON.stringify(allUsers, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

main();