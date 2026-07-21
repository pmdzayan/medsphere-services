import { IsUUID, IsString, IsNumber, Min } from 'class-validator';

export class CreateClaimDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  invoiceId!: string;

  @IsUUID()
  patientId!: string;

  @IsString()
  payerName!: string;

  @IsString()
  policyNumber!: string;

  @IsNumber()
  @Min(0)
  claimedAmount!: number;
}
