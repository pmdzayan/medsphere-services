import { ApiProperty } from '@nestjs/swagger';

export class OrganizationChoiceDto {
  @ApiProperty({ format: 'uuid' })
  membershipId!: string;

  @ApiProperty()
  organizationName!: string;

  @ApiProperty()
  organizationType!: string;
}

/**
 * Returned by the identify-login step instead of a LoginResponseDto when
 * the person's individual identity resolves to more than one active
 * membership. Contains only organization display information the
 * now-password-verified caller is already authorized to know about
 * their own memberships -- never a general organization search/listing.
 */
export class OrganizationSelectionRequiredDto {
  @ApiProperty({ example: true })
  requiresOrganizationSelection = true as const;

  @ApiProperty({ type: [OrganizationChoiceDto] })
  organizations!: OrganizationChoiceDto[];
}
