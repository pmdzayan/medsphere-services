import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { BillingRepository } from './billing.repository';
import { CreateAccountDto } from './dto/create-account.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { CreateClaimDto } from './dto/create-claim.dto';
import { InvoiceStatus, ClaimStatus } from './enums';

@Injectable()
export class BillingService {
  constructor(private readonly repository: BillingRepository) {}

  // ---- Accounts ----

  async createAccount(dto: CreateAccountDto) {
    const existing = await this.repository.findAccountByTenantCode(dto.tenantId, dto.code);
    if (existing) {
      throw new ConflictException(`Account with code "${dto.code}" already exists`);
    }
    return this.repository.createAccount({
      tenantId: dto.tenantId,
      code: dto.code,
      name: dto.name,
      type: dto.type,
    });
  }

  async findAccountsByTenant(tenantId: string) {
    return this.repository.findAccountsByTenant(tenantId);
  }

  // ---- General Ledger ----

  async createDoubleEntry(params: {
    tenantId: string;
    referenceType?: string;
    referenceId?: string;
    memo?: string;
    lines: Array<{ accountId: string; debit: number; credit: number }>;
  }) {
    const journalEntry = await this.repository.createJournalEntry({
      tenantId: params.tenantId,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      memo: params.memo,
    });

    for (const line of params.lines) {
      await this.repository.createJournalLine({
        journalEntryId: journalEntry.id,
        accountId: line.accountId,
        debit: line.debit,
        credit: line.credit,
      });
    }

    return this.repository.createJournalEntry({
      tenantId: params.tenantId,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      memo: params.memo,
    });
  }

  // ---- Invoices ----

  async createInvoice(dto: CreateInvoiceDto) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Invoice must have at least one item');
    }

    const invoiceNumber = `INV-${dto.tenantId.slice(0, 8)}-${Date.now()}`;
    const totalAmount = dto.subtotal + (dto.taxAmount ?? 0) - (dto.discountAmount ?? 0);
    const dueDate = new Date(dto.dueDate);

    const invoice = await this.repository.createInvoice({
      tenantId: dto.tenantId,
      invoiceNumber,
      patientId: dto.patientId,
      encounterId: dto.encounterId,
      subtotal: dto.subtotal,
      taxAmount: dto.taxAmount ?? 0,
      discountAmount: dto.discountAmount ?? 0,
      totalAmount,
      paidAmount: 0,
      balanceDue: totalAmount,
      dueDate,
    });

    for (const item of dto.items) {
      await this.repository.createInvoiceItem({
        invoiceId: invoice.id,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.quantity * item.unitPrice,
        resourceType: item.resourceType,
        resourceId: item.resourceId,
      });
    }

    return this.repository.findInvoiceById(invoice.id);
  }

  async findInvoiceById(id: string) {
    const invoice = await this.repository.findInvoiceById(id);
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async findInvoicesByTenant(
    tenantId: string,
    params: { patientId?: string; status?: string; limit?: number; offset?: number },
  ) {
    return this.repository.findInvoicesByTenant(tenantId, params);
  }

  async issueInvoice(id: string) {
    const invoice = await this.repository.findInvoiceById(id);
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException(`Cannot issue invoice in status: ${invoice.status}`);
    }
    return this.repository.updateInvoiceStatus(id, InvoiceStatus.ISSUED);
  }

  // ---- Payments ----

  async recordPayment(dto: RecordPaymentDto) {
    const invoice = await this.repository.findInvoiceById(dto.invoiceId);
    if (!invoice) throw new NotFoundException('Invoice not found');

    const newPaidAmount = invoice.paidAmount + dto.amount;
    if (newPaidAmount > invoice.totalAmount) {
      throw new BadRequestException('Payment exceeds the invoice balance');
    }

    const newBalance = invoice.totalAmount - newPaidAmount;
    const newStatus = newBalance <= 0 ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;

    await this.repository.createPayment({
      tenantId: dto.tenantId,
      invoiceId: dto.invoiceId,
      amount: dto.amount,
      method: dto.method,
      referenceNo: dto.referenceNo,
    });

    return this.repository.updateInvoiceStatus(dto.invoiceId, newStatus, newPaidAmount, newBalance);
  }

  // ---- Insurance Claims ----

  async createClaim(dto: CreateClaimDto) {
    const invoice = await this.repository.findInvoiceById(dto.invoiceId);
    if (!invoice) throw new NotFoundException('Invoice not found');

    return this.repository.createClaim({
      tenantId: dto.tenantId,
      invoiceId: dto.invoiceId,
      patientId: dto.patientId,
      payerName: dto.payerName,
      policyNumber: dto.policyNumber,
      claimedAmount: dto.claimedAmount,
    });
  }

  async submitClaim(claimId: string) {
    const claim = await this.repository.findClaimById(claimId);
    if (!claim) throw new NotFoundException('Claim not found');
    if (claim.status !== ClaimStatus.DRAFT) {
      throw new BadRequestException(`Cannot submit claim in status: ${claim.status}`);
    }
    return this.repository.updateClaimStatus(claimId, ClaimStatus.SUBMITTED);
  }

  async adjudicateClaim(claimId: string, approvedAmount: number, rejectionReason?: string) {
    const claim = await this.repository.findClaimById(claimId);
    if (!claim) throw new NotFoundException('Claim not found');
    if (claim.status !== ClaimStatus.SUBMITTED && claim.status !== ClaimStatus.IN_REVIEW) {
      throw new BadRequestException(`Cannot adjudicate claim in status: ${claim.status}`);
    }

    const newStatus =
      approvedAmount > 0
        ? approvedAmount >= claim.claimedAmount
          ? ClaimStatus.APPROVED
          : ClaimStatus.PARTIALLY_APPROVED
        : ClaimStatus.REJECTED;

    return this.repository.updateClaimStatus(claimId, newStatus, approvedAmount, rejectionReason);
  }
}
