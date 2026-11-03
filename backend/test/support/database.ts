import type { PrismaService } from '../../src/shared/prisma/prisma.service';

export async function resetDatabase(prisma: PrismaService): Promise<void> {
  const [{ current_database: name }] = await prisma.$queryRaw<
    { current_database: string }[]
  >`SELECT current_database()`;
  if (!name.endsWith('_test')) {
    throw new Error(
      `Refusing to truncate tables: database "${name}" is not a test database (name must end with "_test")`,
    );
  }
  await prisma.$executeRawUnsafe('TRUNCATE TABLE product, review, outbox_event, import_run RESTART IDENTITY CASCADE');
}
