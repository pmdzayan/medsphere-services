import { Module } from '@nestjs/common';
import { BatchRepository } from './batch.repository';
import { BatchService } from './batch.service';
import { BatchController } from './batch.controller';

@Module({
  controllers: [BatchController],
  providers: [BatchRepository, BatchService],
  exports: [BatchRepository, BatchService],
})
export class BatchModule {}
