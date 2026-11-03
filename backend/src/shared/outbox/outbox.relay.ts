import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { errorMessage } from '../util/error-message';
import { OutboxHandlerRegistry } from './outbox-handler.registry';
import {
  MAX_OUTBOX_ATTEMPTS,
  OUTBOX_BATCH_SIZE,
  OUTBOX_HANDLER_TIMEOUT_MS,
  OUTBOX_LEASE_SECONDS,
  outboxBackoffMs,
} from './outbox.types';

interface ClaimedEvent {
  id: string;
  type: string;
  payload: string;
  attempts: number;
}

async function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Polls `outbox_event` and dispatches events to in-process handlers.
 * Claiming bumps `available_at` by a lease, so a crashed process releases its events after the lease expires,
 * and `FOR UPDATE SKIP LOCKED` lets several API instances share the table safely.
 */
@Injectable()
export class OutboxRelay implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelay.name);
  private timer: NodeJS.Timeout | undefined;
  private inFlight: Promise<void> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: OutboxHandlerRegistry,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.outbox.relayEnabled) {
      this.timer = setInterval(() => void this.tick(), this.config.outbox.pollMs);
    }
  }

  /** Runs before PrismaService disconnects: stop polling and let the running batch finish. */
  async onModuleDestroy(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    await this.inFlight;
  }

  /** Processes everything that is currently due. Failed events are rescheduled, so this always terminates. */
  async drain(): Promise<void> {
    while ((await this.processBatch()) > 0) {
      // keep going until nothing is due
    }
  }

  async processBatch(limit = OUTBOX_BATCH_SIZE): Promise<number> {
    const claimed = await this.prisma.$queryRaw<ClaimedEvent[]>`
      UPDATE outbox_event
         SET attempts = attempts + 1,
             available_at = now() + make_interval(secs => ${OUTBOX_LEASE_SECONDS})
       WHERE id IN (
         SELECT id FROM outbox_event
          WHERE processed_at IS NULL
            AND available_at <= now()
            AND attempts < ${MAX_OUTBOX_ATTEMPTS}
          ORDER BY available_at, id
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED)
      RETURNING id::text AS id, type, payload::text AS payload, attempts`;

    const ordered = [...claimed].sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
    for (const event of ordered) {
      await this.dispatch(event);
    }
    return claimed.length;
  }

  private tick(): Promise<void> {
    if (this.inFlight) {
      return this.inFlight;
    }
    const run = (async () => {
      try {
        await this.processBatch();
      } catch (error) {
        this.logger.error(`Outbox relay tick failed: ${errorMessage(error)}`);
      } finally {
        this.inFlight = undefined;
      }
    })();
    this.inFlight = run;
    return run;
  }

  private async dispatch(event: ClaimedEvent): Promise<void> {
    try {
      const handler = this.registry.get(event.type);
      if (!handler) {
        throw new Error(`No outbox handler registered for "${event.type}"`);
      }
      await withTimeout(
        handler(JSON.parse(event.payload)),
        OUTBOX_HANDLER_TIMEOUT_MS,
        `Outbox handler "${event.type}"`,
      );
      await this.prisma.$executeRaw`
        UPDATE outbox_event SET processed_at = now(), last_error = NULL WHERE id = ${event.id}::bigint`;
    } catch (error) {
      const delaySeconds = outboxBackoffMs(event.attempts) / 1000;
      await this.prisma.$executeRaw`
        UPDATE outbox_event
           SET last_error = ${errorMessage(error)},
               available_at = now() + make_interval(secs => ${delaySeconds})
         WHERE id = ${event.id}::bigint
           AND processed_at IS NULL
           AND attempts = ${event.attempts}`;
      const message = `Outbox event ${event.id} (${event.type}) failed on attempt ${event.attempts}: ${errorMessage(error)}`;
      if (event.attempts >= MAX_OUTBOX_ATTEMPTS) {
        this.logger.error(`${message}; giving up (dead letter)`);
      } else {
        this.logger.warn(message);
      }
    }
  }
}
