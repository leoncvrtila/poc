import { Test, type TestingModule } from '@nestjs/testing';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CatalogImportService, CatalogModule } from '../src/modules/catalog';
import { DemoReviewsSeeder, ReviewsModule } from '../src/modules/reviews';
import { AppConfigModule } from '../src/shared/config/app-config.module';
import { PrismaModule } from '../src/shared/prisma/prisma.module';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { resetDatabase } from './support/database';

describe('Demo reviews (integration)', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule, PrismaModule, CatalogModule, ReviewsModule],
    }).compile();
    await moduleRef.init();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('inserts demo reviews once and is a no-op on re-run', async () => {
    const prisma = moduleRef.get(PrismaService);
    await resetDatabase(prisma);
    const csv = readFileSync(resolve(__dirname, '../../data/products.csv'), 'utf8');
    await moduleRef.get(CatalogImportService).importContent(csv, { sourceFile: 'test.csv' });
    await prisma.outboxEvent.deleteMany();
    const userReview = await prisma.review.create({
      data: { productSku: 'P-10001', authorName: 'Real User', rating: 5, comment: 'A genuine customer review.' },
    });
    const seeder = moduleRef.get(DemoReviewsSeeder);

    const first = await seeder.seed();
    const eventsAfterFirst = await prisma.outboxEvent.count();
    const second = await seeder.seed();

    expect(first).toBeGreaterThan(0);
    expect(second).toBe(0);
    expect(await prisma.review.count()).toBe(first + 1);
    expect(await prisma.review.findUnique({ where: { id: userReview.id } })).not.toBeNull();
    expect(await prisma.outboxEvent.count()).toBe(eventsAfterFirst);
  });
});
