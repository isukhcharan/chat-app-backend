import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Seed default channels
  const channels = ['general', 'random', 'dev'];
  for (const name of channels) {
    await prisma.channel.upsert({
      where: { id: `seed-${name}` },
      create: { id: `seed-${name}`, name, description: `The #${name} channel` },
      update: {},
    });
  }
  console.log('Seeded channels: general, random, dev');
}

main().finally(() => prisma.$disconnect());
