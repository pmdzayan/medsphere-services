import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { OutboxService } from '@medsphere/event-bus';

/**
 * Periodically processes pending outbox events by calling
 * OutboxService.processPending().
 *
 * This service bridges the Gate 6 transactional outbox with the
 * notification event handlers. It runs on a configurable interval
 * (default: every 10 seconds) and processes up to 50 events per batch.
 */
@Injectable()
export class OutboxEventProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxEventProcessor.name);
  private readonly intervalMs = parseInt(process.env.NOTIFICATION_POLL_INTERVAL_MS ?? '10000', 10);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly outboxService: OutboxService) {}

  onModuleInit(): void {
    this.logger.log(`Starting outbox event processor (interval: ${this.intervalMs}ms)`);
    this.timer = setInterval(async () => {
      try {
        const processed = await this.outboxService.processPending(50);
        if (processed > 0) {
          this.logger.log(`Processed ${processed} outbox event(s)`);
        }
      } catch (error) {
        this.logger.error(`Error processing outbox events: ${(error as Error).message}`);
      }
    }, this.intervalMs);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.logger.log('Outbox event processor stopped');
    }
  }
}
