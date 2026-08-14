import { Injectable } from '@nestjs/common';
import {
  enqueueNotificationDelivery,
  type EnqueueNotificationDeliveryInput,
} from '@medsphere/database';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationQueueService {
  constructor(private readonly prisma: PrismaService) {}

  enqueue(input: EnqueueNotificationDeliveryInput): Promise<{ readonly enqueued: boolean }> {
    return enqueueNotificationDelivery(this.prisma.client, input);
  }
}
