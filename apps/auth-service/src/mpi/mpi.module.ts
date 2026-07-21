import { Module } from '@nestjs/common';
import { MpiController } from './mpi.controller';
import { MpiService } from './mpi.service';
import { MpiRepository } from './mpi.repository';
import { MpiMatchingService } from './mpi-matching.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [PrismaModule, RbacModule],
  controllers: [MpiController],
  providers: [MpiService, MpiRepository, MpiMatchingService],
  exports: [MpiService, MpiRepository, MpiMatchingService],
})
export class MpiModule {}
