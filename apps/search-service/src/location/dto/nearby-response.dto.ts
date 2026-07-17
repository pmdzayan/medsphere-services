export class NearbyProviderDto {
  id!: string;
  businessName!: string;
  providerType!: string;
  address!: string;
  city!: string;
  state!: string;
  country!: string;
  postalCode!: string;
  latitude!: number;
  longitude!: number;
  distance!: number;
  estimatedTravelDistance?: string;
  isVerified!: boolean;
  isActive!: boolean;
  phone!: string;
  email!: string;
}

export class NearbyResponseDto {
  providers!: NearbyProviderDto[];
  total!: number;
  queryLatitude!: number;
  queryLongitude!: number;
  radiusKm!: number;
  sortBy!: string;
}
