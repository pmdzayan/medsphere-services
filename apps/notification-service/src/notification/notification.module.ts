import { Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { NotificationRepository } from './notification.repository';
import { NotificationSenderService } from './notification-sender.service';
import { TemplateEngine } from './template-engine';
import { EventBusModule } from './event-bus.module';
import { OutboxEventHandler } from './event-handlers/outbox-event-handler.service';
import { OutboxEventProcessor } from './event-handlers/outbox-event-processor.service';
import {
  EmailProvider,
  SmsProvider,
  WhatsappProvider,
  PushProvider,
  MockProvider,
} from './providers';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, EventBusModule],
  controllers: [NotificationController],
  providers: [
    NotificationRepository,
    TemplateEngine,
    EmailProvider,
    SmsProvider,
    WhatsappProvider,
    PushProvider,
    MockProvider,
    NotificationSenderService,
    NotificationService,
    OutboxEventHandler,
    OutboxEventProcessor,
  ],
  exports: [NotificationService, NotificationRepository, NotificationSenderService],
})
export class NotificationModule {}
