import { Module } from '@nestjs/common';
import { StockLedgerController } from './stock-ledger.controller';
import { StockLedgerService } from './stock-ledger.service';
import { StockLedgerRepository } from './stock-ledger.repository';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [StockLedgerController],
  providers: [StockLedgerService, StockLedgerRepository],
  exports: [StockLedgerService, StockLedgerRepository],
})
export class StockLedgerModule {}
