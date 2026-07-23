import { Test, TestingModule } from '@nestjs/testing';
import { WorkflowService } from './workflow.service';
import { WorkflowRepository } from './workflow.repository';
import { OutboxService } from '@medsphere/event-bus';
import { WorkflowStatus, InstanceStatus, ApprovalDecision } from './enums';
import { BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';

describe('WorkflowService', () => {
  let service: WorkflowService;
  let repository: jest.Mocked<WorkflowRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowService,
        {
          provide: WorkflowRepository,
          useValue: {
            findDefinitionByTenantCode: jest.fn(),
            createDefinition: jest.fn(),
            findDefinitionById: jest.fn(),
            findDefinitionsByTenant: jest.fn(),
            findDefinitionsByEntityType: jest.fn(),
            updateDefinitionStatus: jest.fn(),
            deleteDefinition: jest.fn(),
            createInstance: jest.fn(),
            findInstanceById: jest.fn(),
            findInstancesByEntity: jest.fn(),
            findInstancesByTenant: jest.fn(),
            findInstancesByStatus: jest.fn(),
            updateInstance: jest.fn(),
            deleteInstance: jest.fn(),
            createApproval: jest.fn(),
            updateApproval: jest.fn(),
            findApprovalsByInstance: jest.fn(),
            findPendingApprovalsByInstance: jest.fn(),
            createOutboxEvent: jest.fn(),
          },
        },
        {
          provide: OutboxService,
          useValue: {
            enqueue: jest.fn(),
            processPending: jest.fn(),
            on: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<WorkflowService>(WorkflowService);
    repository = module.get(WorkflowRepository);
  });

  describe('createDefinition', () => {
    it('should create a definition when validation passes', async () => {
      repository.findDefinitionByTenantCode.mockResolvedValue(null);
      repository.createDefinition.mockResolvedValue({ id: 'def-1' } as never);
      repository.createOutboxEvent.mockResolvedValue({} as never);

      const result = await service.createDefinition({
        tenantId: 'tenant-1',
        code: 'PO_APPROVAL',
        name: 'PO Approval Workflow',
        entityType: 'PURCHASE_ORDER',
        states: [
          { code: 'DRAFT', name: 'Draft', isInitial: true },
          { code: 'APPROVED', name: 'Approved', isFinal: true },
        ],
        transitions: [{ fromStateCode: 'DRAFT', toStateCode: 'APPROVED', actionName: 'APPROVE' }],
      });

      expect(result.id).toBe('def-1');
      expect(repository.createDefinition).toHaveBeenCalled();
      expect(repository.createOutboxEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'workflow.definition.created',
        }),
      );
    });

    it('should throw BadRequestException when no initial state', async () => {
      await expect(
        service.createDefinition({
          tenantId: 'tenant-1',
          code: 'PO_APPROVAL',
          name: 'PO Approval',
          entityType: 'PURCHASE_ORDER',
          states: [{ code: 'APPROVED', name: 'Approved', isFinal: true }],
          transitions: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when no final state', async () => {
      await expect(
        service.createDefinition({
          tenantId: 'tenant-1',
          code: 'PO_APPROVAL',
          name: 'PO Approval',
          entityType: 'PURCHASE_ORDER',
          states: [{ code: 'DRAFT', name: 'Draft', isInitial: true }],
          transitions: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException when definition already exists', async () => {
      repository.findDefinitionByTenantCode.mockResolvedValue({ id: 'existing' } as never);

      await expect(
        service.createDefinition({
          tenantId: 'tenant-1',
          code: 'PO_APPROVAL',
          name: 'PO Approval',
          entityType: 'PURCHASE_ORDER',
          states: [
            { code: 'DRAFT', name: 'Draft', isInitial: true },
            { code: 'APPROVED', name: 'Approved', isFinal: true },
          ],
          transitions: [],
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findDefinitionById', () => {
    it('should return the definition when found', async () => {
      repository.findDefinitionById.mockResolvedValue({
        id: 'def-1',
        code: 'PO_APPROVAL',
      } as never);
      const result = await service.findDefinitionById('def-1');
      expect(result.id).toBe('def-1');
    });

    it('should throw NotFoundException when not found', async () => {
      repository.findDefinitionById.mockResolvedValue(null);
      await expect(service.findDefinitionById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('startInstance', () => {
    it('should start an instance when definition is active', async () => {
      repository.findDefinitionByTenantCode.mockResolvedValue({
        id: 'def-1',
        code: 'PO_APPROVAL',
        status: WorkflowStatus.ACTIVE,
        states: [{ id: 'state-1', code: 'DRAFT', isInitial: true }],
        transitions: [],
      } as never);
      repository.findInstancesByEntity.mockResolvedValue([]);
      repository.createInstance.mockResolvedValue({ id: 'inst-1' } as never);
      repository.createOutboxEvent.mockResolvedValue({} as never);

      const result = await service.startInstance({
        tenantId: 'tenant-1',
        workflowCode: 'PO_APPROVAL',
        entityType: 'PURCHASE_ORDER',
        entityId: 'po-1',
        initiatorId: 'user-1',
      });

      expect(result.id).toBe('inst-1');
      expect(repository.createInstance).toHaveBeenCalled();
      expect(repository.createOutboxEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'workflow.instance.created',
        }),
      );
    });

    it('should throw NotFoundException when definition not found', async () => {
      repository.findDefinitionByTenantCode.mockResolvedValue(null);
      await expect(
        service.startInstance({
          tenantId: 'tenant-1',
          workflowCode: 'NONEXISTENT',
          entityType: 'PURCHASE_ORDER',
          entityId: 'po-1',
          initiatorId: 'user-1',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when definition is not active', async () => {
      repository.findDefinitionByTenantCode.mockResolvedValue({
        id: 'def-1',
        status: WorkflowStatus.SUSPENDED,
        states: [{ id: 'state-1', code: 'DRAFT', isInitial: true }],
        transitions: [],
      } as never);
      await expect(
        service.startInstance({
          tenantId: 'tenant-1',
          workflowCode: 'PO_APPROVAL',
          entityType: 'PURCHASE_ORDER',
          entityId: 'po-1',
          initiatorId: 'user-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException when active instance already exists', async () => {
      repository.findDefinitionByTenantCode.mockResolvedValue({
        id: 'def-1',
        status: WorkflowStatus.ACTIVE,
        states: [{ id: 'state-1', code: 'DRAFT', isInitial: true }],
        transitions: [],
      } as never);
      repository.findInstancesByEntity.mockResolvedValue([
        { id: 'existing', status: InstanceStatus.IN_PROGRESS } as never,
      ]);
      await expect(
        service.startInstance({
          tenantId: 'tenant-1',
          workflowCode: 'PO_APPROVAL',
          entityType: 'PURCHASE_ORDER',
          entityId: 'po-1',
          initiatorId: 'user-1',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('executeTransition', () => {
    it('should execute transition and emit approval_requested event for non-final state', async () => {
      repository.findInstanceById.mockResolvedValue({
        id: 'inst-1',
        tenantId: 'tenant-1',
        status: InstanceStatus.IN_PROGRESS,
        currentStateId: 'state-1',
        currentState: { code: 'DRAFT' },
        workflowDefinition: {
          code: 'PO_APPROVAL',
          states: [
            { id: 'state-1', code: 'DRAFT' },
            { id: 'state-2', code: 'PENDING_L1', isFinal: false },
          ],
          transitions: [
            {
              id: 'trans-1',
              fromStateId: 'state-1',
              toStateId: 'state-2',
              actionName: 'SUBMIT_FOR_APPROVAL',
              approvalLevel: 1,
              minAmountThreshold: null,
            },
          ],
        },
        entityType: 'PURCHASE_ORDER',
        entityId: 'po-1',
        metadata: null,
      } as never);
      repository.createApproval.mockResolvedValue({
        id: 'appr-1',
        decision: ApprovalDecision.PENDING,
      } as never);
      repository.updateInstance.mockResolvedValue({} as never);
      repository.createOutboxEvent.mockResolvedValue({} as never);

      const result = await service.executeTransition({
        instanceId: 'inst-1',
        actionName: 'SUBMIT_FOR_APPROVAL',
        userId: 'user-1',
      });

      expect(result.isFinalState).toBe(false);
      expect(repository.createOutboxEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'workflow.instance.approval_requested',
        }),
      );
    });

    it('should throw NotFoundException when instance not found', async () => {
      repository.findInstanceById.mockResolvedValue(null);
      await expect(
        service.executeTransition({
          instanceId: 'nonexistent',
          actionName: 'SUBMIT_FOR_APPROVAL',
          userId: 'user-1',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when transition not found', async () => {
      repository.findInstanceById.mockResolvedValue({
        id: 'inst-1',
        status: InstanceStatus.IN_PROGRESS,
        currentStateId: 'state-1',
        currentState: { code: 'DRAFT' },
        workflowDefinition: {
          code: 'PO_APPROVAL',
          states: [{ id: 'state-1', code: 'DRAFT' }],
          transitions: [],
        },
      } as never);
      await expect(
        service.executeTransition({
          instanceId: 'inst-1',
          actionName: 'INVALID_ACTION',
          userId: 'user-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when threshold not met', async () => {
      repository.findInstanceById.mockResolvedValue({
        id: 'inst-1',
        status: InstanceStatus.IN_PROGRESS,
        currentStateId: 'state-1',
        currentState: { code: 'DRAFT' },
        workflowDefinition: {
          code: 'PO_APPROVAL',
          states: [
            { id: 'state-1', code: 'DRAFT' },
            { id: 'state-2', code: 'PENDING_L1', isFinal: false },
          ],
          transitions: [
            {
              id: 'trans-1',
              fromStateId: 'state-1',
              toStateId: 'state-2',
              actionName: 'SUBMIT_FOR_APPROVAL',
              approvalLevel: 1,
              minAmountThreshold: 10000,
            },
          ],
        },
      } as never);
      await expect(
        service.executeTransition({
          instanceId: 'inst-1',
          actionName: 'SUBMIT_FOR_APPROVAL',
          userId: 'user-1',
          amount: 5000,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('approveInstance', () => {
    it('should approve instance and emit completed event for final state', async () => {
      repository.findInstanceById.mockResolvedValue({
        id: 'inst-1',
        tenantId: 'tenant-1',
        status: InstanceStatus.IN_PROGRESS,
        currentStateId: 'state-1',
        currentState: { code: 'PENDING_L1' },
        workflowDefinition: {
          code: 'PO_APPROVAL',
          states: [
            { id: 'state-1', code: 'PENDING_L1' },
            { id: 'state-2', code: 'APPROVED', isFinal: true },
          ],
          transitions: [
            {
              id: 'trans-1',
              fromStateId: 'state-1',
              toStateId: 'state-2',
              actionName: 'APPROVE_L1',
              approvalLevel: 1,
              minAmountThreshold: null,
            },
          ],
        },
        entityType: 'PURCHASE_ORDER',
        entityId: 'po-1',
      } as never);
      repository.createApproval.mockResolvedValue({
        id: 'appr-1',
        decision: ApprovalDecision.APPROVED,
      } as never);
      repository.updateInstance.mockResolvedValue({} as never);
      repository.createOutboxEvent.mockResolvedValue({} as never);

      const result = await service.approveInstance({
        instanceId: 'inst-1',
        actionName: 'APPROVE_L1',
        approverId: 'user-1',
      });

      expect(result.decision).toBe(ApprovalDecision.APPROVED);
      expect(result.instanceStatus).toBe(InstanceStatus.APPROVED);
      expect(repository.createOutboxEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'workflow.instance.approved',
        }),
      );
    });

    it('should reject instance when action contains REJECT', async () => {
      repository.findInstanceById.mockResolvedValue({
        id: 'inst-1',
        tenantId: 'tenant-1',
        status: InstanceStatus.IN_PROGRESS,
        currentStateId: 'state-1',
        currentState: { code: 'PENDING_L1' },
        workflowDefinition: {
          code: 'PO_APPROVAL',
          states: [
            { id: 'state-1', code: 'PENDING_L1' },
            { id: 'state-2', code: 'REJECTED', isFinal: false },
          ],
          transitions: [
            {
              id: 'trans-1',
              fromStateId: 'state-1',
              toStateId: 'state-2',
              actionName: 'REJECT',
              approvalLevel: 1,
              minAmountThreshold: null,
            },
          ],
        },
      } as never);
      repository.createApproval.mockResolvedValue({
        id: 'appr-1',
        decision: ApprovalDecision.REJECTED,
      } as never);
      repository.updateInstance.mockResolvedValue({} as never);
      repository.createOutboxEvent.mockResolvedValue({} as never);

      const result = await service.approveInstance({
        instanceId: 'inst-1',
        actionName: 'REJECT',
        approverId: 'user-1',
      });

      expect(result.decision).toBe(ApprovalDecision.REJECTED);
      expect(result.instanceStatus).toBe(InstanceStatus.REJECTED);
      expect(repository.createOutboxEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'workflow.instance.rejected',
        }),
      );
    });
  });

  describe('cancelInstance', () => {
    it('should cancel an in-progress instance', async () => {
      repository.findInstanceById.mockResolvedValue({
        id: 'inst-1',
        tenantId: 'tenant-1',
        status: InstanceStatus.IN_PROGRESS,
        workflowDefinition: { code: 'PO_APPROVAL' },
        entityType: 'PURCHASE_ORDER',
        entityId: 'po-1',
      } as never);
      repository.updateInstance.mockResolvedValue({} as never);
      repository.createOutboxEvent.mockResolvedValue({} as never);

      const result = await service.cancelInstance({
        instanceId: 'inst-1',
        userId: 'user-1',
        reason: 'No longer needed',
      });

      expect(result.message).toBe('Workflow instance cancelled successfully');
      expect(repository.createOutboxEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'workflow.instance.cancelled',
        }),
      );
    });

    it('should throw NotFoundException when instance not found', async () => {
      repository.findInstanceById.mockResolvedValue(null);
      await expect(
        service.cancelInstance({
          instanceId: 'nonexistent',
          userId: 'user-1',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when instance is not in_progress', async () => {
      repository.findInstanceById.mockResolvedValue({
        id: 'inst-1',
        status: InstanceStatus.APPROVED,
      } as never);
      await expect(
        service.cancelInstance({
          instanceId: 'inst-1',
          userId: 'user-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findApprovals', () => {
    it('should return approvals when instance found', async () => {
      repository.findInstanceById.mockResolvedValue({ id: 'inst-1' } as never);
      repository.findApprovalsByInstance.mockResolvedValue([
        { id: 'appr-1', decision: ApprovalDecision.APPROVED },
      ] as never);

      const result = await service.findApprovals('inst-1');
      expect(result).toHaveLength(1);
    });

    it('should throw NotFoundException when instance not found', async () => {
      repository.findInstanceById.mockResolvedValue(null);
      await expect(service.findApprovals('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});
