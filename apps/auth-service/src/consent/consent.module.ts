import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditPersistenceModule } from '../audit/audit-persistence.module';
import { ConsentRepository } from './consent.repository';
import { ConsentService } from './consent.service';
import { ConsentController } from './consent.controller';

@Module({
  imports: [PrismaModule, AuditPersistenceModule],
  controllers: [ConsentController],
  providers: [ConsentRepository, ConsentService],
  exports: [ConsentService],
})
export class ConsentModule {}
