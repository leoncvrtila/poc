import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MAX_OUTBOX_ATTEMPTS } from './outbox.types';

export interface OutboxStats {
  /** Events that gave up after `MAX_OUTBOX_ATTEMPTS`. */
  deadLetters: number;
  /** Unprocessed events still being retried that are older than the threshold. */
  stuck: number;
}

@Injectable()
export class OutboxMonitor {
  constructor(private readonly prisma: PrismaService) {}

  async stats(stuckAfterMs = 15 * 60_000): Promise<OutboxStats> {
    const [deadLetters, stuck] = await Promise.all([
      this.prisma.outboxEvent.count({ where: { processedAt: null, attempts: { gte: MAX_OUTBOX_ATTEMPTS } } }),
      this.prisma.outboxEvent.count({
        where: {
          processedAt: null,
          attempts: { lt: MAX_OUTBOX_ATTEMPTS },
          createdAt: { lt: new Date(Date.now() - stuckAfterMs) },
        },
      }),
    ]);
    return { deadLetters, stuck };
  }
}
