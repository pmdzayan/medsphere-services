import { ProviderType } from './create-provider.dto';

export class ProviderResponseDto {
  id!: string;
  tenantId!: string;
  providerType!: ProviderType;
  businessName!: string;
  ownerName!: string;
  email!: string;
  phone!: string;
  address!: string;
  city!: string;
  state!: string;
  country!: string;
  postalCode!: string;
  latitude!: number;
  longitude!: number;
  isVerified!: boolean;
  isActive!: boolean;
  createdAt!: string;
  updatedAt!: string;
}
