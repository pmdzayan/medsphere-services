import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { HealthModule } from '@medsphere/common';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { LocalizationModule } from './localization/localization.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { AuthRateLimitModule } from './security/auth-rate-limit.module';
import { RbacModule } from './rbac/rbac.module';
import { AuditModule } from './audit/audit.module';
import { MpiModule } from './mpi/mpi.module';

@Module({
  imports: [
    HealthModule,
    AuthRateLimitModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    LocalizationModule,
    RbacModule,
    AuditModule,
    MpiModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
