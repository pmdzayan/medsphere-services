import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditWriter } from './audit-writer.service';

@Module({
  imports: [PrismaModule],
  providers: [AuditWriter],
  exports: [AuditWriter],
})
export class AuditPersistenceModule {}
