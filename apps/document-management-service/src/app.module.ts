import { Module } from '@nestjs/common';
import { HealthModule } from '@medsphere/common';
import { PrismaModule } from './prisma/prisma.module';
import { DocumentModule } from './document/document.module';

@Module({
  imports: [HealthModule, PrismaModule, DocumentModule],
})
export class AppModule {}
