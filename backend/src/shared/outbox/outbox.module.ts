import { Module } from '@nestjs/common';
import { OutboxHandlerRegistry } from './outbox-handler.registry';
import { OutboxMonitor } from './outbox-monitor';
import { OutboxPublisher } from './outbox.publisher';
import { OutboxRelay } from './outbox.relay';

@Module({
  providers: [OutboxPublisher, OutboxHandlerRegistry, OutboxRelay, OutboxMonitor],
  exports: [OutboxPublisher, OutboxHandlerRegistry, OutboxRelay, OutboxMonitor],
})
export class OutboxModule {}
