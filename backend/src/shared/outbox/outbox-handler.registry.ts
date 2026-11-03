import { Injectable } from '@nestjs/common';
import type { OutboxHandler } from './outbox.types';

@Injectable()
export class OutboxHandlerRegistry {
  private readonly handlers = new Map<string, OutboxHandler>();

  register(type: string, handler: OutboxHandler): void {
    if (this.handlers.has(type)) {
      throw new Error(`An outbox handler for "${type}" is already registered`);
    }
    this.handlers.set(type, handler);
  }

  get(type: string): OutboxHandler | undefined {
    return this.handlers.get(type);
  }
}
