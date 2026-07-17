import { Module } from '@nestjs/common';
import { SearchRepository } from './search.repository';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SearchController],
  providers: [SearchRepository, SearchService],
  exports: [SearchService],
})
export class SearchModule {}
