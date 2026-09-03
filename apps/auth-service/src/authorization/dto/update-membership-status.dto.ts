import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export const APPROVED_MEMBERSHIP_TARGET_STATUSES = ['SUSPENDED', 'REVOKED'] as const;
export type ApprovedMembershipTargetStatus = (typeof APPROVED_MEMBERSHIP_TARGET_STATUSES)[number];

export class UpdateMembershipStatusDto {
  @ApiProperty({
    enum: APPROVED_MEMBERSHIP_TARGET_STATUSES,
    description: 'The target membership status lifecycle transition',
  })
  @IsIn(APPROVED_MEMBERSHIP_TARGET_STATUSES)
  status!: ApprovedMembershipTargetStatus;
}
