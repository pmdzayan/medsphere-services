import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BillingRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Accounts ----

  async createAccount(data: { tenantId: string; code: string; name: string; type: string }) {
    return this.prisma.client.account.create({
      data: {
        tenant: { connect: { id: data.tenantId } },
        code: data.code,
        name: data.name,
        type: data.type as never,
      },
    });
  }

  async findAccountByTenantCode(tenantId: string, code: string) {
    return this.prisma.client.account.findUnique({
      where: { tenantId_code: { tenantId, code } },
    });
  }

  async findAccountsByTenant(tenantId: string) {
    return this.prisma.client.account.findMany({
      where: { tenantId },
      orderBy: { code: 'asc' },
    });
  }

  // ---- Journal Entries ----

  async createJournalEntry(data: {
    tenantId: string;
    referenceType?: string;
    referenceId?: string;
    memo?: string;
  }) {
    return this.prisma.client.journalEntry.create({
      data: {
        tenant: { connect: { id: data.tenantId } },
        referenceType: data.referenceType,
        referenceId: data.referenceId,
        memo: data.memo,
      },
    });
  }

  async createJournalLine(data: {
    journalEntryId: string;
    accountId: string;
    debit: number;
    credit: number;
  }) {
    return this.prisma.client.journalLine.create({ data });
  }

  // ---- Invoices ----

  async createInvoice(data: {
    tenantId: string;
    invoiceNumber: string;
    patientId: string;
    encounterId?: string;
    subtotal: number;
    taxAmount: number;
    discountAmount: number;
    totalAmount: number;
    paidAmount: number;
    balanceDue: number;
    dueDate: Date;
  }) {
    return this.prisma.client.invoice.create({
      data: {
        tenant: { connect: { id: data.tenantId } },
        invoiceNumber: data.invoiceNumber,
        patient: { connect: { id: data.patientId } },
        encounter: data.encounterId ? { connect: { id: data.encounterId } } : undefined,
        subtotal: data.subtotal,
        taxAmount: data.taxAmount,
        discountAmount: data.discountAmount,
        totalAmount: data.totalAmount,
        paidAmount: data.paidAmount,
        balanceDue: data.balanceDue,
        dueDate: data.dueDate,
      },
    });
  }

  async createInvoiceItem(data: {
    invoiceId: string;
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    resourceType?: string;
    resourceId?: string;
  }) {
    return this.prisma.client.invoiceItem.create({ data });
  }

  async findInvoiceById(id: string) {
    return this.prisma.client.invoice.findUnique({
      where: { id },
      include: { items: true, payments: true, claims: true },
    });
  }

  async findInvoicesByTenant(
    tenantId: string,
    params: { patientId?: string; status?: string; limit?: number; offset?: number },
  ) {
    const where: Record<string, unknown> = { tenantId };
    if (params.patientId) where.patientId = params.patientId;
    if (params.status) where.status = params.status;

    const take = params.limit ?? 50;
    const skip = params.offset ?? 0;

    const [data, total] = await Promise.all([
      this.prisma.client.invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        include: { items: true, payments: true },
      }),
      this.prisma.client.invoice.count({ where }),
    ]);

    return { data, total, limit: take, offset: skip };
  }

  async updateInvoiceStatus(id: string, status: string, paidAmount?: number, balanceDue?: number) {
    const data: Record<string, unknown> = { status: status as never };
    if (paidAmount !== undefined) data.paidAmount = paidAmount;
    if (balanceDue !== undefined) data.balanceDue = balanceDue;
    return this.prisma.client.invoice.update({ where: { id }, data });
  }

  // ---- Payments ----

  async createPayment(data: {
    tenantId: string;
    invoiceId: string;
    amount: number;
    method: string;
    referenceNo?: string;
  }) {
    return this.prisma.client.payment.create({
      data: {
        tenantId: data.tenantId,
        invoiceId: data.invoiceId,
        amount: data.amount,
        method: data.method as never,
        referenceNo: data.referenceNo,
      },
    });
  }

  // ---- Insurance Claims ----

  async createClaim(data: {
    tenantId: string;
    invoiceId: string;
    patientId: string;
    payerName: string;
    policyNumber: string;
    claimedAmount: number;
  }) {
    return this.prisma.client.insuranceClaim.create({
      data: {
        tenantId: data.tenantId,
        invoiceId: data.invoiceId,
        patientId: data.patientId,
        payerName: data.payerName,
        policyNumber: data.policyNumber,
        claimedAmount: data.claimedAmount,
      },
    });
  }

  async findClaimById(id: string) {
    return this.prisma.client.insuranceClaim.findUnique({ where: { id } });
  }

  async updateClaimStatus(
    id: string,
    status: string,
    approvedAmount?: number,
    rejectionReason?: string,
  ) {
    const data: Record<string, unknown> = { status: status as never };
    if (approvedAmount !== undefined) data.approvedAmount = approvedAmount;
    if (rejectionReason !== undefined) data.rejectionReason = rejectionReason;
    return this.prisma.client.insuranceClaim.update({ where: { id }, data });
  }
}
