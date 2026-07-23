import { Global, Module } from '@nestjs/common';
import { OutboxRepository, OutboxService } from '@medsphere/event-bus';

/**
 * Provides the Gate 6 transactional outbox event bus as NestJS providers.
 *
 * The OutboxRepository and OutboxService are plain framework-agnostic
 * classes from @medsphere/event-bus. This module wraps them so they can
 * be injected into NestJS services.
 */
@Global()
@Module({
  providers: [
    OutboxRepository,
    {
      provide: OutboxService,
      useFactory: (repository: OutboxRepository) => new OutboxService(repository),
      inject: [OutboxRepository],
    },
  ],
  exports: [OutboxRepository, OutboxService],
})
export class EventBusModule {}
