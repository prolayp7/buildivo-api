import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { seedProducts } from './seed-products';

const prisma = new PrismaClient();
seedProducts(prisma)
  .then((result) => console.log('Buildivo catalogue:', result))
  .catch((error: unknown) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
