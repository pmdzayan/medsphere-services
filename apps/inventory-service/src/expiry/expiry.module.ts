import { Module } from '@nestjs/common';
import { ExpiryService } from './expiry.service';
import { ExpiryController } from './expiry.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ExpiryController],
  providers: [ExpiryService],
  exports: [ExpiryService],
})
export class ExpiryModule {}
