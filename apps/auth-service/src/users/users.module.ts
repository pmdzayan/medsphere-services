import { Module } from '@nestjs/common';
import { UsersRepository } from './users.repository';
import { PrivacyRepository } from './privacy.repository';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { LocalizationModule } from '../localization/localization.module';

@Module({
  imports: [PrismaModule, LocalizationModule],
  controllers: [UsersController],
  providers: [UsersRepository, PrivacyRepository, UsersService],
  exports: [UsersRepository, UsersService],
})
export class UsersModule {}
