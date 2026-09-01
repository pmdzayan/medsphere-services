import { Module } from '@nestjs/common';
import { UsersRepository } from './users.repository';
import { PrivacyRepository } from './privacy.repository';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { LocalizationModule } from '../localization/localization.module';
import { AuditPersistenceModule } from '../audit/audit-persistence.module';

@Module({
  imports: [PrismaModule, LocalizationModule, AuditPersistenceModule],
  controllers: [UsersController],
  providers: [UsersRepository, PrivacyRepository, UsersService],
  exports: [UsersRepository, UsersService],
})
export class UsersModule {}
