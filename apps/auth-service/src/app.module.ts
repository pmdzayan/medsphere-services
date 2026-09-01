import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { HEALTH_READINESS_CHECK, HealthModule, MetricsModule } from '@medsphere/common';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { LocalizationModule } from './localization/localization.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { AuthRateLimitModule } from './security/auth-rate-limit.module';
import { AuthorizationModule } from './authorization/authorization.module';
import { AuditModule } from './audit/audit.module';
import { InventoryModule } from './inventory/inventory.module';
import { NotificationModule } from './notifications/notification.module';
import { VerificationModule } from './verification/verification.module';
import { ConsentModule } from './consent/consent.module';
import { AuthReadinessService } from './health/auth-readiness.service';

@Module({
  imports: [
    HealthModule.register({
      imports: [PrismaModule, AuthRateLimitModule],
      readinessProvider: {
        provide: HEALTH_READINESS_CHECK,
        useClass: AuthReadinessService,
      },
    }),
    AuthRateLimitModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    LocalizationModule,
    AuthorizationModule,
    AuditModule,
    InventoryModule,
    NotificationModule,
    VerificationModule,
    ConsentModule,
    MetricsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
