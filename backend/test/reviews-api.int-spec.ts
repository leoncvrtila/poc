import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import request from 'supertest';
import { configureApp } from '../src/app.setup';
import { CatalogImportService, CatalogModule } from '../src/modules/catalog';
import { ReviewsModule } from '../src/modules/reviews';
import { APP_CONFIG, loadConfig, type AppConfig } from '../src/shared/config/app-config';
import { AppConfigModule } from '../src/shared/config/app-config.module';
import { OutboxPublisher } from '../src/shared/outbox';
import { PrismaModule } from '../src/shared/prisma/prisma.module';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { resetDatabase } from './support/database';

const PIM_EXPORT = readFileSync(resolve(__dirname, '../../data/products.csv'), 'utf8');
const validReview = { authorName: '  Ana K. ', rating: 4, comment: '  Stable emulsions at low dosage.  ' };
const ZERO_WIDTH_SPACE = '\u{200B}';
const ZERO_WIDTH_JOINER = '\u{200D}';

async function createApp(config?: AppConfig): Promise<INestApplication> {
  const builder = Test.createTestingModule({
    imports: [AppConfigModule, PrismaModule, CatalogModule, ReviewsModule],
  });
  if (config) {
    builder.overrideProvider(APP_CONFIG).useValue(config);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

describe('Reviews API (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await app.get(CatalogImportService).importContent(PIM_EXPORT, { sourceFile: 'test.csv' });
    await prisma.outboxEvent.deleteMany();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates a trimmed review and records a rating-changed event in the same transaction', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/products/P-10001/reviews')
      .send(validReview)
      .expect(201);

    expect(response.body).toMatchObject({
      authorName: 'Ana K.',
      rating: 4,
      comment: 'Stable emulsions at low dosage.',
    });
    const events = await prisma.outboxEvent.findMany();
    expect(events.map((event) => [event.type, event.payload])).toEqual([
      ['reviews.rating-changed', { sku: 'P-10001' }],
    ]);
  });

  it.each([
    [{ ...validReview, rating: 6 }],
    [{ ...validReview, rating: 3.5 }],
    [{ ...validReview, authorName: ' ' }],
    [{ ...validReview, comment: 'too short' }],
    [{ rating: 5 }],
    [{ ...validReview, authorName: ZERO_WIDTH_SPACE.repeat(2) }],
    [{ ...validReview, authorName: '!!' }],
    [{ ...validReview, comment: ZERO_WIDTH_SPACE.repeat(12) }],
    [{ ...validReview, comment: '..........' }],
    [{ ...validReview, comment: '\u{0000}'.repeat(12) }],
  ])('rejects invalid input %p with 400', async (body) => {
    await request(app.getHttpServer()).post('/api/products/P-10001/reviews').send(body).expect(400);
    expect(await prisma.review.count()).toBe(0);
  });

  it('strips NUL characters instead of failing with a 500', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/products/P-10001/reviews')
      .send({ ...validReview, comment: 'Stable emul\u{0000}sions at low dosage.' })
      .expect(201);

    expect(response.body.comment).toBe('Stable emulsions at low dosage.');
    expect((await prisma.review.findFirstOrThrow()).comment).toBe('Stable emulsions at low dosage.');
  });

  it('collapses whitespace in the author name and excess blank lines in the comment', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/products/P-10001/reviews')
      .send({ ...validReview, authorName: 'Ana   \t K.', comment: 'First line here.\n\n\n\n\nSecond line.' })
      .expect(201);

    expect(response.body.authorName).toBe('Ana K.');
    expect(response.body.comment).toBe('First line here.\n\nSecond line.');
  });

  it('keeps zero-width joiners inside emoji sequences', async () => {
    const family = ['\u{1F468}', '\u{1F469}', '\u{1F467}'].join(ZERO_WIDTH_JOINER);
    const response = await request(app.getHttpServer())
      .post('/api/products/P-10001/reviews')
      .send({ ...validReview, comment: `Great product ${family} for everyone.` })
      .expect(201);

    expect(response.body.comment).toContain(family);
  });

  it('rolls back the review when publishing the outbox event fails', async () => {
    jest.spyOn(app.get(OutboxPublisher), 'publish').mockRejectedValueOnce(new Error('boom'));

    await request(app.getHttpServer()).post('/api/products/P-10001/reviews').send(validReview).expect(500);

    expect(await prisma.review.count()).toBe(0);
  });

  it('ignores client-supplied id, createdAt and productSku', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/products/P-10001/reviews')
      .send({ ...validReview, id: 'client-id', createdAt: '2001-01-01T00:00:00Z', productSku: 'P-10002' })
      .expect(201);

    const stored = await prisma.review.findFirstOrThrow();
    expect(stored.id).not.toBe('client-id');
    expect(stored.id).toBe(response.body.id);
    expect(stored.productSku).toBe('P-10001');
    expect(stored.createdAt.getFullYear()).not.toBe(2001);
  });

  it('rejects oversized JSON bodies with 413', async () => {
    await request(app.getHttpServer())
      .post('/api/products/P-10001/reviews')
      .send({ ...validReview, comment: 'x'.repeat(40_000) })
      .expect(413);
    expect(await prisma.review.count()).toBe(0);
  });

  it('rejects a duplicate comment on the same product, ignoring case and surrounding spaces, but not on another product', async () => {
    const post = (sku: string, comment: string) =>
      request(app.getHttpServer())
        .post(`/api/products/${sku}/reviews`)
        .send({ ...validReview, comment });

    await post('P-10001', 'Stable emulsions at low dosage.').expect(201);
    const duplicate = await post('P-10001', '  STABLE emulsions at LOW dosage.  ').expect(409);
    await post('P-10002', 'Stable emulsions at low dosage.').expect(201);

    expect(duplicate.body.message).toBe('This review was already submitted.');
    expect(await prisma.review.count()).toBe(2);
  });

  it('allows the same comment again once the duplicate window has passed', async () => {
    await prisma.review.create({
      data: {
        productSku: 'P-10001',
        authorName: 'Ana K.',
        rating: 4,
        comment: 'Stable emulsions at low dosage.',
        createdAt: new Date(Date.now() - 25 * 60 * 60_000),
      },
    });

    await request(app.getHttpServer()).post('/api/products/P-10001/reviews').send(validReview).expect(201);
  });

  describe('duplicate detection', () => {
    const post = (comment: string, authorName = 'Ana K.') =>
      request(app.getHttpServer())
        .post('/api/products/P-10001/reviews')
        .send({ ...validReview, authorName, comment });

    it('treats % and _ in a comment literally, not as wildcards', async () => {
      await post('100% natural and stable, great').expect(201);
      await post('100X natural and stable, great').expect(201);
      await post('100% natural and stable, great').expect(409);
      await post('100_ natural and stable, great').expect(201);
      await post('100X natural and stable_ great').expect(201);

      expect(await prisma.review.count()).toBe(4);
    });

    it('does not collide for a different author with the same text', async () => {
      await post('Very good product', 'Ana K.').expect(201);
      await post('Very good product', 'Bob L.').expect(201);

      expect(await prisma.review.count()).toBe(2);
    });

    it('detects the same author and text despite case and inner spacing', async () => {
      await post('Very good   product').expect(201);
      const duplicate = await post('very GOOD \t product', 'ANA   k.').expect(409);

      expect(duplicate.body.message).toBe('This review was already submitted.');
      expect(await prisma.review.count()).toBe(1);
    });
  });

  it('rejects a review containing a link and stores nothing', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/products/P-10001/reviews')
      .send({ ...validReview, comment: 'Great, see https://cheap-pills.ru today' })
      .expect(400);

    expect(JSON.stringify(response.body.message)).toContain('Links are not allowed in reviews.');
    expect(await prisma.review.count()).toBe(0);
  });

  it('rejects a filled honeypot and stores nothing', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/products/P-10001/reviews')
      .send({ ...validReview, website: 'bot.example' })
      .expect(400);

    expect(JSON.stringify(response.body.message)).toContain('Review could not be accepted.');
    expect(await prisma.review.count()).toBe(0);
  });

  it('accepts an empty honeypot', async () => {
    await request(app.getHttpServer())
      .post('/api/products/P-10001/reviews')
      .send({ ...validReview, website: '' })
      .expect(201);
  });

  it('returns 404 for an unknown product', async () => {
    await request(app.getHttpServer()).post('/api/products/P-99999/reviews').send(validReview).expect(404);
  });

  it('returns 409 for a product that is no longer listed', async () => {
    await prisma.product.update({ where: { sku: 'P-10001' }, data: { listed: false } });
    await request(app.getHttpServer()).post('/api/products/P-10001/reviews').send(validReview).expect(409);
  });

  it('returns 404 when listing reviews of an unknown product', async () => {
    await request(app.getHttpServer()).get('/api/products/P-99999/reviews').expect(404);
  });

  it('rejects page numbers that overflow the database with 400', async () => {
    await request(app.getHttpServer()).get('/api/products/P-10001/reviews?page=1e20').expect(400);
  });

  it('lists reviews newest first with a rating summary', async () => {
    await prisma.review.createMany({
      data: [
        {
          productSku: 'P-10001',
          authorName: 'Old',
          rating: 5,
          comment: 'First review text.',
          createdAt: new Date('2026-01-01'),
        },
        {
          productSku: 'P-10001',
          authorName: 'New',
          rating: 3,
          comment: 'Second review text.',
          createdAt: new Date('2026-02-01'),
        },
      ],
    });

    const response = await request(app.getHttpServer()).get('/api/products/P-10001/reviews?pageSize=1').expect(200);

    expect(response.body.summary).toEqual({ average: 4, count: 2, distribution: { 1: 0, 2: 0, 3: 1, 4: 0, 5: 1 } });
    expect(response.body.items.map((item: { authorName: string }) => item.authorName)).toEqual(['New']);
    expect(response.body.total).toBe(2);
  });
});

describe('Reviews API rate limit (integration)', () => {
  it('returns 429 with Retry-After after the configured number of submissions', async () => {
    const app = await createApp({ ...loadConfig(), reviewRateLimit: { limit: 2, ttlMs: 60_000 } });
    try {
      const prisma = app.get(PrismaService);
      await resetDatabase(prisma);
      await app.get(CatalogImportService).importContent(PIM_EXPORT, { sourceFile: 'test.csv' });
      // Distinct comments: identical ones would be rejected as duplicates before the limit matters.
      const post = (n: number) =>
        request(app.getHttpServer())
          .post('/api/products/P-10001/reviews')
          .send({ ...validReview, comment: `Stable emulsions, trial ${n}.` });

      await post(1).expect(201);
      await post(2).expect(201);
      const blocked = await post(3).expect(429);

      expect(blocked.headers['retry-after']).toBeDefined();
      expect(await prisma.review.count()).toBe(2);
    } finally {
      await app.close();
    }
  });
});
