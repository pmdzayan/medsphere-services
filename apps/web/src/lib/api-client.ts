import type {
  AuthenticatedSession,
  GoogleLoginRequest,
  GoogleRegisterRequest,
  IdentifyLoginRequest,
  LoginRequest,
  OrganizationSelectionRequired,
  RegistrationRequest,
  RegistrationResponse,
  RequestPhoneOtpRequest,
  SelectOrganizationLoginRequest,
  VerifyPhoneOtpRequest,
  VerifyPhoneOtpResponse,
} from './auth-contract';
import { toAuditSearchParams, type AuditEventFilters, type AuditEventPage } from './audit-contract';
import type {
  PublicMedicineSearchResponse,
  PublicNearbyMedicineSearchRequest,
  PublicNearbyMedicineSearchResponse,
} from './public-medicine-search-contract';
import type {
  AuthorizationCatalogue,
  CreateRoleRequest,
  Membership,
  MembershipCatalogue,
  Role,
  UpdateRoleRequest,
} from './authorization-contract';
import {
  type BatchQuarantineRequest,
  type BatchQuarantineResponse,
  type CompletedTransferRequest,
  type CompletedTransferResponse,
  type DamagedStockRequest,
  type DamagedStockResponse,
  toInventoryStockSearchParams,
  type InventoryStockFilters,
  type InventoryStockPage,
  toInventoryExpirySearchParams,
  type InventoryExpiryWorklistFilters,
  type InventoryExpiryWorklistPage,
  type ProviderAccess,
} from './inventory-contract';
import type {
  ConsentStatus,
  LanguageUpdateRequest,
  LanguageUpdateResponse,
  PrivacyPreferences,
  PrivacyPreferenceUpdate,
  RecordConsentRequest,
  SupportedLanguage,
} from './settings-contract';
import {
  toReservationSearchParams,
  type ProviderReservationPage,
  type ReservationCreationRequest,
  type ReservationCreationResponse,
  type ReservationFilters,
  type ReservationTransitionRequest,
  type ReservationTransitionResponse,
} from './reservation-contract';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function googleRegister(
  request: GoogleRegisterRequest,
): Promise<RegistrationResponse> {
  const response = await fetch('/api/auth/google/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
    cache: 'no-store',
  });

  if (!response.ok) {
    let message =
      response.status === 429
        ? 'Too many onboarding requests. Try again later.'
        : 'Unable to process the onboarding request.';

    try {
      const payload: unknown = await response.json();
      if (payload && typeof payload === 'object') {
        const candidate = payload as { message?: unknown };
        if (typeof candidate.message === 'string' && candidate.message.length > 0) {
          message = candidate.message.slice(0, 240);
        }
      }
    } catch {
      // Preserve bounded fallback.
    }

    throw new ApiError(message, response.status);
  }

  return (await response.json()) as RegistrationResponse;
}

export async function googleLogin(request: GoogleLoginRequest): Promise<AuthenticatedSession> {
  const response = await fetch('/api/auth/google', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new ApiError(
      response.status === 401
        ? 'Google sign-in could not be authorized.'
        : 'Google sign-in failed. Try again.',
      response.status,
    );
  }

  return (await response.json()) as AuthenticatedSession;
}

export async function login(request: LoginRequest): Promise<AuthenticatedSession> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new ApiError(
      response.status === 401
        ? 'The organization, email, or password is incorrect.'
        : 'Sign-in failed. Try again.',
      response.status,
    );
  }

  return (await response.json()) as AuthenticatedSession;
}

/** Task 0010: slug-free login, step 1 -- verifies identity alone. */
export async function identifyLogin(
  request: IdentifyLoginRequest,
): Promise<AuthenticatedSession | OrganizationSelectionRequired> {
  const response = await fetch('/api/auth/login/identify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new ApiError(
      response.status === 401
        ? 'The email or password is incorrect.'
        : 'Sign-in failed. Try again.',
      response.status,
    );
  }

  return (await response.json()) as AuthenticatedSession | OrganizationSelectionRequired;
}

/** Task 0010: slug-free login, step 2 -- completes login for a chosen membership. */
export async function selectOrganizationLogin(
  request: SelectOrganizationLoginRequest,
): Promise<AuthenticatedSession> {
  const response = await fetch('/api/auth/login/select-organization', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new ApiError(
      response.status === 401
        ? 'The email or password is incorrect.'
        : 'Sign-in failed. Try again.',
      response.status,
    );
  }

  return (await response.json()) as AuthenticatedSession;
}

export async function register(request: RegistrationRequest): Promise<RegistrationResponse> {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
    cache: 'no-store',
  });

  if (!response.ok) {
    let message =
      response.status === 429
        ? 'Too many onboarding requests. Try again later.'
        : 'Unable to process the onboarding request.';
    try {
      const payload: unknown = await response.json();
      if (payload && typeof payload === 'object') {
        const candidate = payload as { message?: unknown };
        if (typeof candidate.message === 'string' && candidate.message.length > 0) {
          message = candidate.message.slice(0, 240);
        }
      }
    } catch {
      // Preserve the bounded fallback.
    }
    throw new ApiError(message, response.status);
  }

  return (await response.json()) as RegistrationResponse;
}

export async function requestPhoneOtp(request: RequestPhoneOtpRequest): Promise<void> {
  await requestJson('/api/auth/verification/phone/request', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
}

export async function verifyPhoneOtp(
  request: VerifyPhoneOtpRequest,
): Promise<VerifyPhoneOtpResponse> {
  return requestJson<VerifyPhoneOtpResponse>('/api/auth/verification/phone/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
}

export async function getAuthorizationCatalogue(): Promise<AuthorizationCatalogue> {
  return requestJson<AuthorizationCatalogue>('/api/authorization/catalogue');
}

export async function updateMembershipStatus(
  membershipId: string,
  status: 'SUSPENDED' | 'REVOKED',
): Promise<Membership> {
  return requestJson<Membership>(
    `/api/authorization/memberships/${encodeURIComponent(membershipId)}/status`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    },
  );
}

export async function getAuditEvents(filters: AuditEventFilters = {}): Promise<AuditEventPage> {
  const search = toAuditSearchParams(filters);
  const query = search.toString();
  return requestJson<AuditEventPage>(`/api/audit/events${query ? `?${query}` : ''}`);
}

export async function getAssignedProviders(): Promise<ProviderAccess[]> {
  return requestJson<ProviderAccess[]>('/api/inventory/providers');
}

export async function searchPublicMedicine(
  providerId: string,
  q: string,
): Promise<PublicMedicineSearchResponse> {
  const search = new URLSearchParams({ q });
  return requestJson<PublicMedicineSearchResponse>(
    `/api/public/providers/${encodeURIComponent(providerId)}/medicine-search?${search.toString()}`,
  );
}

export async function searchNearbyMedicine(
  request: PublicNearbyMedicineSearchRequest,
): Promise<PublicNearbyMedicineSearchResponse> {
  const search = new URLSearchParams({
    q: request.q,
    latitude: String(request.latitude),
    longitude: String(request.longitude),
  });

  if (request.radiusKm !== undefined) {
    search.set('radiusKm', String(request.radiusKm));
  }

  if (request.limit !== undefined) {
    search.set('limit', String(request.limit));
  }

  if (request.offset !== undefined) {
    search.set('offset', String(request.offset));
  }

  return requestJson<PublicNearbyMedicineSearchResponse>(
    `/api/public/medicine-discovery/nearby?${search.toString()}`,
  );
}

export async function getProviderStock(
  filters: InventoryStockFilters,
): Promise<InventoryStockPage> {
  const search = toInventoryStockSearchParams(filters);
  return requestJson<InventoryStockPage>(`/api/inventory/stock?${search.toString()}`);
}

export async function getProviderExpiryWorklist(
  filters: InventoryExpiryWorklistFilters,
): Promise<InventoryExpiryWorklistPage> {
  const search = toInventoryExpirySearchParams(filters);
  return requestJson<InventoryExpiryWorklistPage>(
    `/api/inventory/expiry-worklist?${search.toString()}`,
  );
}

export async function quarantineBatch(
  providerId: string,
  batchId: string,
  request: BatchQuarantineRequest,
): Promise<BatchQuarantineResponse> {
  return requestJson<BatchQuarantineResponse>(
    `/api/inventory/providers/${encodeURIComponent(providerId)}/batches/${encodeURIComponent(batchId)}/quarantine`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    },
  );
}

export async function recordDamagedStock(
  providerId: string,
  batchId: string,
  request: DamagedStockRequest,
): Promise<DamagedStockResponse> {
  return requestJson<DamagedStockResponse>(
    `/api/inventory/providers/${encodeURIComponent(providerId)}/batches/${encodeURIComponent(
      batchId,
    )}/damage`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    },
  );
}

export async function recordCompletedTransfer(
  sourceProviderId: string,
  request: CompletedTransferRequest,
): Promise<CompletedTransferResponse> {
  return requestJson<CompletedTransferResponse>(
    `/api/inventory/providers/${encodeURIComponent(sourceProviderId)}/transfers`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    },
  );
}

export async function getProviderReservations(
  filters: ReservationFilters,
): Promise<ProviderReservationPage> {
  const search = toReservationSearchParams(filters);
  return requestJson<ProviderReservationPage>(`/api/inventory/reservations?${search.toString()}`);
}

export async function transitionProviderReservation(
  providerId: string,
  reservationId: string,
  request: ReservationTransitionRequest,
): Promise<ReservationTransitionResponse> {
  return requestJson<ReservationTransitionResponse>(
    `/api/inventory/providers/${encodeURIComponent(providerId)}/reservations/${encodeURIComponent(
      reservationId,
    )}/transitions`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    },
  );
}

export async function createProviderReservation(
  providerId: string,
  request: ReservationCreationRequest,
): Promise<ReservationCreationResponse> {
  return requestJson<ReservationCreationResponse>(
    `/api/inventory/providers/${encodeURIComponent(providerId)}/reservations`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    },
  );
}

export async function getPrivacyPreferences(): Promise<PrivacyPreferences> {
  return requestJson<PrivacyPreferences>('/api/settings/privacy');
}

export async function updatePrivacyPreferences(
  request: PrivacyPreferenceUpdate,
): Promise<PrivacyPreferences> {
  return requestJson<PrivacyPreferences>('/api/settings/privacy', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
}

export async function getSupportedLanguages(): Promise<SupportedLanguage[]> {
  return requestJson<SupportedLanguage[]>('/api/settings/languages');
}

export async function getConsentStatus(): Promise<ConsentStatus[]> {
  const response = await requestJson<{ data: ConsentStatus[] }>('/api/settings/consent');
  return response.data;
}

export async function recordConsent(request: RecordConsentRequest): Promise<ConsentStatus> {
  return requestJson<ConsentStatus>('/api/settings/consent', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
}

export async function updatePreferredLanguage(
  request: LanguageUpdateRequest,
): Promise<LanguageUpdateResponse> {
  return requestJson<LanguageUpdateResponse>('/api/settings/language', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
}

export async function createRole(request: CreateRoleRequest): Promise<Role> {
  return requestJson<Role>('/api/authorization/roles', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
}

export async function updateRole(roleId: string, request: UpdateRoleRequest): Promise<Role> {
  return requestJson<Role>(`/api/authorization/roles/${roleId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
}

export async function deleteRole(roleId: string, version: number): Promise<void> {
  await requestJson<void>(`/api/authorization/roles/${roleId}`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ version }),
  });
}

export async function getMembershipCatalogue(): Promise<MembershipCatalogue> {
  return requestJson<MembershipCatalogue>('/api/authorization/memberships');
}

export async function setRoleAssignment(
  membershipId: string,
  roleId: string,
  assigned: boolean,
): Promise<void> {
  await requestJson<void>(`/api/authorization/memberships/${membershipId}/roles/${roleId}`, {
    method: assigned ? 'PUT' : 'DELETE',
  });
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response = await fetch(url, { ...init, cache: 'no-store' });
  if (response.status === 401) {
    const refreshed = await fetch('/api/auth/refresh', {
      method: 'POST',
      cache: 'no-store',
    });
    if (refreshed.ok) {
      response = await fetch(url, { ...init, cache: 'no-store' });
    }
  }
  if (!response.ok) {
    let message = 'Request failed. Try again.';
    try {
      const payload: unknown = await response.json();
      if (payload && typeof payload === 'object') {
        const candidate = payload as { message?: unknown };
        if (typeof candidate.message === 'string' && candidate.message.length > 0) {
          message = candidate.message.slice(0, 240);
        }
      }
    } catch {
      // Preserve the bounded public fallback.
    }
    throw new ApiError(message, response.status);
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}
