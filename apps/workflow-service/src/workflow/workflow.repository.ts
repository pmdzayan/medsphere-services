import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkflowStatus, InstanceStatus, ApprovalDecision } from './enums';

/**
 * Data access layer for the workflow engine.
 *
 * Follows the same repository pattern as NotificationRepository and
 * DocumentRepository, using PrismaService to interact with the database.
 */
@Injectable()
export class WorkflowRepository {
  constructor(private readonly prisma: PrismaService) {}

  // === WorkflowDefinition ===

  async createDefinition(data: {
    tenantId: string;
    code: string;
    name: string;
    description?: string | null;
    entityType: string;
    status?: WorkflowStatus;
    states: {
      code: string;
      name: string;
      isInitial?: boolean;
      isFinal?: boolean;
      requiresApproval?: boolean;
    }[];
    transitions: {
      fromStateCode: string;
      toStateCode: string;
      actionName: string;
      requiredPermission?: string | null;
      requiredRoleId?: string | null;
      minAmountThreshold?: number | null;
      approvalLevel?: number;
    }[];
  }) {
    return this.prisma.client.$transaction(async (tx) => {
      // Create the definition
      const definition = await tx.workflowDefinition.create({
        data: {
          tenant: { connect: { id: data.tenantId } },
          code: data.code,
          name: data.name,
          description: data.description,
          entityType: data.entityType,
          status: data.status ?? WorkflowStatus.ACTIVE,
        },
      });

      // Create states
      const stateMap = new Map<string, string>();
      for (const state of data.states) {
        const created = await tx.workflowState.create({
          data: {
            workflowDefinition: { connect: { id: definition.id } },
            code: state.code,
            name: state.name,
            isInitial: state.isInitial ?? false,
            isFinal: state.isFinal ?? false,
            requiresApproval: state.requiresApproval ?? false,
          },
        });
        stateMap.set(state.code, created.id);
      }

      // Create transitions
      for (const transition of data.transitions) {
        const fromStateId = stateMap.get(transition.fromStateCode);
        const toStateId = stateMap.get(transition.toStateCode);
        if (!fromStateId || !toStateId) {
          throw new Error(
            `State not found: fromStateCode=${transition.fromStateCode}, toStateCode=${transition.toStateCode}`,
          );
        }
        await tx.workflowTransition.create({
          data: {
            workflowDefinition: { connect: { id: definition.id } },
            fromState: { connect: { id: fromStateId } },
            toState: { connect: { id: toStateId } },
            actionName: transition.actionName,
            ...(transition.requiredPermission !== null &&
            transition.requiredPermission !== undefined
              ? { requiredPermission: transition.requiredPermission }
              : {}),
            ...(transition.requiredRoleId !== null && transition.requiredRoleId !== undefined
              ? { role: { connect: { id: transition.requiredRoleId } } }
              : {}),
            ...(transition.minAmountThreshold !== null &&
            transition.minAmountThreshold !== undefined
              ? { minAmountThreshold: transition.minAmountThreshold }
              : {}),
            approvalLevel: transition.approvalLevel ?? 1,
          },
        });
      }

      return definition;
    });
  }

  async findDefinitionById(id: string) {
    return this.prisma.client.workflowDefinition.findUnique({
      where: { id },
      include: {
        states: true,
        transitions: {
          include: {
            fromState: true,
            toState: true,
            role: true,
          },
        },
      },
    });
  }

  async findDefinitionByTenantCode(tenantId: string, code: string) {
    return this.prisma.client.workflowDefinition.findFirst({
      where: { tenantId, code },
      include: {
        states: true,
        transitions: {
          include: {
            fromState: true,
            toState: true,
            role: true,
          },
        },
      },
    });
  }

  async findDefinitionsByTenant(tenantId: string, skip = 0, take = 50) {
    const [data, total] = await Promise.all([
      this.prisma.client.workflowDefinition.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.client.workflowDefinition.count({ where: { tenantId } }),
    ]);
    return { data, total, limit: take, offset: skip };
  }

  async findDefinitionsByEntityType(tenantId: string, entityType: string, skip = 0, take = 50) {
    const [data, total] = await Promise.all([
      this.prisma.client.workflowDefinition.findMany({
        where: { tenantId, entityType },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.client.workflowDefinition.count({ where: { tenantId, entityType } }),
    ]);
    return { data, total, limit: take, offset: skip };
  }

  async updateDefinitionStatus(id: string, status: WorkflowStatus) {
    return this.prisma.client.workflowDefinition.update({
      where: { id },
      data: { status },
    });
  }

  async deleteDefinition(id: string) {
    return this.prisma.client.workflowDefinition.delete({
      where: { id },
    });
  }

  // === WorkflowInstance ===

  async createInstance(data: {
    tenantId: string;
    workflowDefinitionId: string;
    currentStateId: string;
    entityType: string;
    entityId: string;
    initiatorId: string;
    metadata?: Record<string, unknown> | null;
  }) {
    return this.prisma.client.workflowInstance.create({
      data: {
        tenant: { connect: { id: data.tenantId } },
        workflowDefinition: { connect: { id: data.workflowDefinitionId } },
        currentState: { connect: { id: data.currentStateId } },
        entityType: data.entityType,
        entityId: data.entityId,
        initiator: { connect: { id: data.initiatorId } },
        metadata: data.metadata as never,
      },
      include: {
        workflowDefinition: true,
        currentState: true,
      },
    });
  }

  async findInstanceById(id: string) {
    return this.prisma.client.workflowInstance.findUnique({
      where: { id },
      include: {
        workflowDefinition: {
          include: {
            states: true,
            transitions: {
              include: {
                fromState: true,
                toState: true,
                role: true,
              },
            },
          },
        },
        currentState: true,
        initiator: { select: { id: true, firstName: true, lastName: true } },
        approvals: {
          include: {
            transition: true,
            approver: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });
  }

  async findInstancesByEntity(tenantId: string, entityType: string, entityId: string) {
    return this.prisma.client.workflowInstance.findMany({
      where: { tenantId, entityType, entityId },
      orderBy: { createdAt: 'desc' },
      include: {
        workflowDefinition: true,
        currentState: true,
      },
    });
  }

  async findInstancesByTenant(tenantId: string, skip = 0, take = 50) {
    const [data, total] = await Promise.all([
      this.prisma.client.workflowInstance.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          workflowDefinition: true,
          currentState: true,
        },
      }),
      this.prisma.client.workflowInstance.count({ where: { tenantId } }),
    ]);
    return { data, total, limit: take, offset: skip };
  }

  async findInstancesByStatus(tenantId: string, status: InstanceStatus, skip = 0, take = 50) {
    const [data, total] = await Promise.all([
      this.prisma.client.workflowInstance.findMany({
        where: { tenantId, status },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          workflowDefinition: true,
          currentState: true,
        },
      }),
      this.prisma.client.workflowInstance.count({ where: { tenantId, status } }),
    ]);
    return { data, total, limit: take, offset: skip };
  }

  async updateInstance(
    id: string,
    data: {
      currentStateId?: string;
      status?: InstanceStatus;
      metadata?: Record<string, unknown> | null;
    },
  ) {
    return this.prisma.client.workflowInstance.update({
      where: { id },
      data: {
        ...(data.currentStateId ? { currentState: { connect: { id: data.currentStateId } } } : {}),
        ...(data.status ? { status: data.status } : {}),
        ...(data.metadata !== undefined ? { metadata: data.metadata as never } : {}),
      },
    });
  }

  async deleteInstance(id: string) {
    return this.prisma.client.workflowInstance.delete({
      where: { id },
    });
  }

  // === WorkflowApproval ===

  async createApproval(data: {
    workflowInstanceId: string;
    transitionId: string;
    approverId?: string | null;
    decision?: ApprovalDecision;
    comments?: string | null;
  }) {
    return this.prisma.client.workflowApproval.create({
      data: {
        workflowInstanceId: data.workflowInstanceId,
        transitionId: data.transitionId,
        ...(data.approverId ? { approverId: data.approverId } : {}),
        decision: data.decision ?? ApprovalDecision.PENDING,
        comments: data.comments,
      },
    });
  }

  async updateApproval(
    id: string,
    data: {
      decision: ApprovalDecision;
      approverId?: string | null;
      comments?: string | null;
      decidedAt?: Date | null;
    },
  ) {
    return this.prisma.client.workflowApproval.update({
      where: { id },
      data: {
        decision: data.decision,
        ...(data.approverId ? { approverId: data.approverId } : {}),
        comments: data.comments,
        decidedAt: data.decidedAt,
      },
    });
  }

  async findApprovalsByInstance(workflowInstanceId: string) {
    return this.prisma.client.workflowApproval.findMany({
      where: { workflowInstanceId },
      orderBy: { createdAt: 'desc' },
      include: {
        transition: true,
        approver: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async findPendingApprovalsByInstance(workflowInstanceId: string) {
    return this.prisma.client.workflowApproval.findMany({
      where: {
        workflowInstanceId,
        decision: ApprovalDecision.PENDING,
      },
      include: {
        transition: {
          include: {
            fromState: true,
            toState: true,
          },
        },
      },
    });
  }

  // === OutboxEvent (for workflow lifecycle events) ===

  async createOutboxEvent(data: {
    tenantId: string;
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload: Record<string, unknown>;
    correlationId?: string | null;
  }) {
    return this.prisma.client.outboxEvent.create({
      data: {
        tenant: { connect: { id: data.tenantId } },
        eventType: data.eventType,
        aggregateType: data.aggregateType,
        aggregateId: data.aggregateId,
        payload: data.payload as never,
        correlationId: data.correlationId,
      },
    });
  }
}
