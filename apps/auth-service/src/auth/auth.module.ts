import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthConfigService } from './auth-config.service';
import { GoogleIdentityVerifierService } from './google-identity-verifier.service';
import { AuthSecurityEventService } from './auth-security-event.service';
import { JwtStrategy } from './jwt.strategy';
import { PasswordService } from './password.service';
import { RegistrationService } from './registration.service';
import { SessionRepository } from './session.repository';
import { TokenService } from './token.service';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { OrganizationModule } from '../organization/organization.module';
import { AuditPersistenceModule } from '../audit/audit-persistence.module';

@Module({
  imports: [
    PrismaModule,
    UsersModule,
    OrganizationModule,
    AuditPersistenceModule,
    PassportModule.register({ defaultStrategy: 'jwt', session: false }),
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthConfigService,
    GoogleIdentityVerifierService,
    AuthSecurityEventService,
    JwtStrategy,
    PasswordService,
    RegistrationService,
    SessionRepository,
    TokenService,
  ],
  exports: [AuthConfigService, SessionRepository, TokenService],
})
export class AuthModule {}
