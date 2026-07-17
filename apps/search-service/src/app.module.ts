import { Module } from '@nestjs/common';
import { HealthModule } from '@medsphere/common';
import { PrismaModule } from './prisma/prisma.module';
import { SearchModule } from './search/search.module';
import { LocationModule } from './location/location.module';

@Module({
  imports: [HealthModule, PrismaModule, SearchModule, LocationModule],
})
export class AppModule {}
