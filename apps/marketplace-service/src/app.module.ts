import { Module } from '@nestjs/common';
import { HealthModule } from '@medsphere/common';
import { PrismaModule } from './prisma/prisma.module';
import { EventBusModule } from './event-bus.module';
import { MarketplaceModule } from './marketplace/marketplace.module';

@Module({
  imports: [HealthModule, PrismaModule, EventBusModule, MarketplaceModule],
})
export class AppModule {}
