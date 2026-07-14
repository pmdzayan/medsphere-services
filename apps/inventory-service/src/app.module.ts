import { Module } from '@nestjs/common';
import { HealthModule } from '@medsphere/common';

@Module({
  imports: [HealthModule],
})
export class AppModule {}
