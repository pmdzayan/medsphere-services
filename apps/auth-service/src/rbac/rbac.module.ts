import { Module } from '@nestjs/common';
import { RbacRepository } from './rbac.repository';
import { RbacService } from './rbac.service';
import { RbacController } from './rbac.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { PermissionsGuard } from '../common/guards/permissions.guard';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [RbacController],
  providers: [RbacRepository, RbacService, PermissionsGuard],
  exports: [RbacRepository, RbacService, PermissionsGuard],
})
export class RbacModule {}
