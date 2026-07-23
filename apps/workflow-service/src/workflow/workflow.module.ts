import { Module } from '@nestjs/common';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { WorkflowRepository } from './workflow.repository';
import { EventBusModule } from './event-bus.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, EventBusModule],
  controllers: [WorkflowController],
  providers: [WorkflowRepository, WorkflowService],
  exports: [WorkflowService, WorkflowRepository],
})
export class WorkflowModule {}
