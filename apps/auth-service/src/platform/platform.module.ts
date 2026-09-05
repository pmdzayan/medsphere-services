import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { PrismaModule } from '../prisma/prisma.module';
import { AuditPersistenceModule } from '../audit/audit-persistence.module';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { OrganizationModule } from '../organization/organization.module';

import { PlatformController } from './platform.controller';
import { PlatformAuthService } from './platform-auth.service';
import { PlatformAdminService } from './platform-admin.service';
import { PlatformInvitationService } from './platform-invitation.service';
import { PlatformRepository } from './platform.repository';
import { PlatformSessionRepository } from './platform-session.repository';
import { PlatformTokenService } from './platform-token.service';
import { PlatformJwtStrategy } from './guards/platform-jwt.strategy';
import { PlatformAuthGuard } from './guards/platform-auth.guard';
import { PlatformPermissionsGuard } from './guards/platform-permissions.guard';

@Module({
  imports: [
    PrismaModule,
    AuditPersistenceModule,
    UsersModule,
    OrganizationModule,
    AuthModule,
    PassportModule.register({ defaultStrategy: 'platform-jwt', session: false }),
    JwtModule.register({}),
  ],
  controllers: [PlatformController],
  providers: [
    PlatformAuthService,
    PlatformAdminService,
    PlatformInvitationService,
    PlatformRepository,
    PlatformSessionRepository,
    PlatformTokenService,
    PlatformJwtStrategy,
    PlatformAuthGuard,
    PlatformPermissionsGuard,
  ],
  exports: [
    PlatformAuthService,
    PlatformAdminService,
    PlatformInvitationService,
    PlatformRepository,
    PlatformSessionRepository,
    PlatformTokenService,
    PlatformJwtStrategy,
    PlatformAuthGuard,
    PlatformPermissionsGuard,
  ],
})
export class PlatformModule {}
