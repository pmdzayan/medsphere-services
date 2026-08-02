import { Module } from '@nestjs/common';
import { AuditWriter } from '@medsphere/database';
import { StockService } from './stock.service';

@Module({
  providers: [AuditWriter, StockService],
  exports: [StockService],
})
export class StockModule {}
