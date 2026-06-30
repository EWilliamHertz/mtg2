import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set!');
  process.exit(1);
}

const prisma = new PrismaClient();

console.log('✓ Prisma client initialized');

export default prisma;
