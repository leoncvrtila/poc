import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import type { OutboxMessage } from './outbox.types';

@Injectable()
export class OutboxPublisher {
  /** Must be called with the transaction client of the change being described. */
  async publish(tx: Prisma.TransactionClient, messages: OutboxMessage[]): Promise<void> {
    if (messages.length === 0) {
      return;
    }
    await tx.outboxEvent.createMany({
      data: messages.map((message) => ({
        type: message.type,
        payload: message.payload as Prisma.InputJsonValue,
      })),
    });
  }
}
