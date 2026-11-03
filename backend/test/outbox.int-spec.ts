import { Test, type TestingModule } from '@nestjs/testing';
import { APP_CONFIG, loadConfig } from '../src/shared/config/app-config';
import { AppConfigModule } from '../src/shared/config/app-config.module';
import {
  MAX_OUTBOX_ATTEMPTS,
  OutboxHandlerRegistry,
  OutboxModule,
  OutboxPublisher,
  OutboxRelay,
} from '../src/shared/outbox';
import { PrismaModule } from '../src/shared/prisma/prisma.module';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { resetDatabase } from './support/database';

describe('Outbox (integration)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let publisher: OutboxPublisher;
  let registry: OutboxHandlerRegistry;
  let relay: OutboxRelay;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppConfigModule, PrismaModule, OutboxModule] }).compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    publisher = moduleRef.get(OutboxPublisher);
    registry = moduleRef.get(OutboxHandlerRegistry);
    relay = moduleRef.get(OutboxRelay);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  it('does not keep events when the surrounding transaction rolls back', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await publisher.publish(tx, [{ type: 'test.rollback', payload: { n: 1 } }]);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');

    expect(await prisma.outboxEvent.count()).toBe(0);
  });

  it('dispatches due events in order and marks them processed', async () => {
    const handled: unknown[] = [];
    registry.register('test.ok', (payload) => {
      handled.push(payload);
      return Promise.resolve();
    });
    await prisma.$transaction((tx) =>
      publisher.publish(tx, [
        { type: 'test.ok', payload: { n: 1 } },
        { type: 'test.ok', payload: { n: 2 } },
      ]),
    );

    await relay.drain();

    expect(handled).toEqual([{ n: 1 }, { n: 2 }]);
    const events = await prisma.outboxEvent.findMany();
    expect(events.every((event) => event.processedAt !== null)).toBe(true);
  });

  it('records the error and schedules a retry when a handler fails', async () => {
    registry.register('test.fail', () => Promise.reject(new Error('search is down')));
    await prisma.$transaction((tx) => publisher.publish(tx, [{ type: 'test.fail', payload: {} }]));
    const before = Date.now();

    await relay.drain();

    const [event] = await prisma.outboxEvent.findMany();
    expect(event.processedAt).toBeNull();
    expect(event.attempts).toBe(1);
    expect(event.lastError).toContain('search is down');
    expect(event.availableAt.getTime()).toBeGreaterThan(before);
    // backoff (2 s) must have overwritten the 10-minute claim lease
    expect(event.availableAt.getTime()).toBeLessThan(before + 60_000);
  });

  it('hands every event to exactly one of several concurrent relays', async () => {
    const handled: number[] = [];
    registry.register('test.concurrent', (payload) => {
      handled.push((payload as { n: number }).n);
      return Promise.resolve();
    });
    const messages = Array.from({ length: 30 }, (_, n) => ({ type: 'test.concurrent', payload: { n } }));
    await prisma.$transaction((tx) => publisher.publish(tx, messages));

    await Promise.all([relay.processBatch(), relay.processBatch(), relay.processBatch()]);
    await relay.drain();

    expect([...handled].sort((a, b) => a - b)).toEqual(Array.from({ length: 30 }, (_, n) => n));
    const events = await prisma.outboxEvent.findMany();
    expect(events).toHaveLength(30);
    expect(events.every((event) => event.processedAt !== null)).toBe(true);
  });

  it('leaves dead letters untouched', async () => {
    const handler = jest.fn(() => Promise.resolve());
    registry.register('test.dead', handler);
    const created = await prisma.outboxEvent.create({
      data: {
        type: 'test.dead',
        payload: {},
        attempts: MAX_OUTBOX_ATTEMPTS,
        availableAt: new Date(Date.now() - 60_000),
      },
    });

    await relay.drain();

    expect(handler).not.toHaveBeenCalled();
    const event = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: created.id } });
    expect(event.processedAt).toBeNull();
  });

  it('records an error for events without a registered handler', async () => {
    await prisma.$transaction((tx) => publisher.publish(tx, [{ type: 'test.unknown', payload: {} }]));

    await relay.drain();

    const [event] = await prisma.outboxEvent.findMany();
    expect(event.processedAt).toBeNull();
    expect(event.lastError).toContain('No outbox handler registered');
  });
});

async function waitUntil(condition: () => boolean, what: string, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${what}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('Outbox relay shutdown (integration)', () => {
  let moduleRef: TestingModule | undefined;
  let reader: PrismaService;

  async function startRelayModule(): Promise<TestingModule> {
    const testing = await Test.createTestingModule({ imports: [AppConfigModule, PrismaModule, OutboxModule] })
      .overrideProvider(APP_CONFIG)
      .useValue({ ...loadConfig(), outbox: { pollMs: 20, relayEnabled: true } })
      .compile();
    await testing.init();
    moduleRef = testing;
    return testing;
  }

  async function closeModule(testing: TestingModule): Promise<void> {
    moduleRef = undefined;
    await testing.close();
  }

  beforeAll(async () => {
    reader = new PrismaService(loadConfig());
    await reader.$connect();
  });

  afterAll(async () => {
    await reader.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(reader);
  });

  afterEach(async () => {
    await moduleRef?.close();
    moduleRef = undefined;
  });

  it('waits for an in-flight event on shutdown', async () => {
    const testing = await startRelayModule();
    let started = false;
    testing.get(OutboxHandlerRegistry).register('test.slow', async () => {
      started = true;
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    await testing
      .get(PrismaService)
      .$transaction((tx) => testing.get(OutboxPublisher).publish(tx, [{ type: 'test.slow', payload: {} }]));
    await waitUntil(() => started, 'the relay to start the handler');

    await closeModule(testing);

    const [event] = await reader.outboxEvent.findMany();
    expect(event.processedAt).not.toBeNull();
  });

  it('does not tick after shutdown', async () => {
    const testing = await startRelayModule();
    const processBatch = jest.spyOn(testing.get(OutboxRelay), 'processBatch');
    await waitUntil(() => processBatch.mock.calls.length > 0, 'the relay to tick');

    await closeModule(testing);
    const callsAtClose = processBatch.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(processBatch.mock.calls.length).toBe(callsAtClose);
  });
});
