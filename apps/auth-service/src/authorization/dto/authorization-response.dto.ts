import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PermissionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  description!: string;
}

export class EffectivePermissionsResponseDto {
  @ApiProperty({ type: [String] })
  permissionKeys!: string[];
}

export class RoleResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  description!: string | null;

  @ApiProperty({ enum: ['SYSTEM', 'TENANT'] })
  type!: 'SYSTEM' | 'TENANT';

  @ApiProperty({ minimum: 1 })
  version!: number;

  @ApiProperty({ type: [String] })
  permissionKeys!: string[];

  @ApiProperty({ minimum: 0 })
  assignmentCount!: number;
}

export class RoleListResponseDto {
  @ApiProperty({ type: [RoleResponseDto] })
  data!: RoleResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  offset!: number;
}

export class AssignmentResponseDto {
  @ApiProperty({ format: 'uuid' })
  membershipId!: string;

  @ApiProperty({ format: 'uuid' })
  roleId!: string;

  @ApiProperty()
  roleName!: string;
}

export class ProviderAccessResponseDto {
  @ApiProperty({ format: 'uuid' })
  membershipId!: string;

  @ApiProperty({ format: 'uuid' })
  providerId!: string;

  @ApiProperty()
  businessName!: string;

  @ApiProperty({ enum: ['PHARMACY', 'HOSPITAL', 'CLINIC', 'LABORATORY', 'DOCTOR'] })
  providerType!: 'PHARMACY' | 'HOSPITAL' | 'CLINIC' | 'LABORATORY' | 'DOCTOR';

  @ApiProperty()
  isActive!: boolean;
}

export class MembershipRoleSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;
}

export class MembershipResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty()
  firstName!: string;

  @ApiProperty()
  lastName!: string;

  @ApiProperty({ enum: ['PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED'] })
  status!: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED';

  @ApiProperty({ type: [MembershipRoleSummaryDto] })
  roles!: MembershipRoleSummaryDto[];
}

export class MembershipListResponseDto {
  @ApiProperty({ type: [MembershipResponseDto] })
  data!: MembershipResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  offset!: number;
}

export class ProviderStaffMemberResponseDto {
  @ApiProperty({ format: 'uuid' })
  membershipId!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty()
  firstName!: string;

  @ApiProperty()
  lastName!: string;

  @ApiProperty({ enum: ['PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED'] })
  status!: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED';

  @ApiProperty({ type: [MembershipRoleSummaryDto] })
  roles!: MembershipRoleSummaryDto[];
}

export class ProviderStaffListResponseDto {
  @ApiProperty({ type: [ProviderStaffMemberResponseDto] })
  data!: ProviderStaffMemberResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  offset!: number;
}


export class ProviderLocationScopeResponseDto {
  @ApiProperty({ format: 'uuid' })
  locationId!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;
}

export class ProviderDepartmentScopeResponseDto {
  @ApiProperty({ format: 'uuid' })
  departmentId!: string;

  @ApiProperty({ format: 'uuid' })
  locationId!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;
}

export class ProviderScopeResponseDto {
  @ApiProperty({ format: 'uuid' })
  membershipId!: string;

  @ApiProperty({ format: 'uuid' })
  providerId!: string;

  @ApiProperty({ type: [ProviderLocationScopeResponseDto] })
  locations!: ProviderLocationScopeResponseDto[];

  @ApiProperty({ type: [ProviderDepartmentScopeResponseDto] })
  departments!: ProviderDepartmentScopeResponseDto[];
}

export class ProviderLocationAccessResponseDto {
  @ApiProperty({ format: 'uuid' })
  membershipId!: string;

  @ApiProperty({ format: 'uuid' })
  providerId!: string;

  @ApiProperty({ format: 'uuid' })
  locationId!: string;
}

export class ProviderDepartmentAccessResponseDto {
  @ApiProperty({ format: 'uuid' })
  membershipId!: string;

  @ApiProperty({ format: 'uuid' })
  providerId!: string;

  @ApiProperty({ format: 'uuid' })
  departmentId!: string;
}
