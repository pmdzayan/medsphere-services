import { Module } from '@nestjs/common';
import { HealthModule } from '@medsphere/common';
import { PrismaModule } from './prisma/prisma.module';
import { SearchModule } from './search/search.module';

@Module({
  imports: [HealthModule, PrismaModule, SearchModule],
})
export class AppModule {}
