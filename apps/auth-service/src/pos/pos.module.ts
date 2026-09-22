import { Module } from '@nestjs/common';
import { AuditPersistenceModule } from '../audit/audit-persistence.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PosController } from './pos.controller';
import { PosFiscalService } from './pos-fiscal.service';

@Module({
  imports: [PrismaModule, AuthorizationModule, AuditPersistenceModule],
  controllers: [PosController],
  providers: [PosFiscalService],
  exports: [PosFiscalService],
})
export class PosModule {}
