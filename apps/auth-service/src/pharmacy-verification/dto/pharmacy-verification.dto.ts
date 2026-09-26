import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * CORRECTION (CTO review): `governmentIdReference` is documented as an
 * opaque, bounded identifier -- NOT a document upload, NOT a public
 * URL, and never fetched or validated against any external service.
 * Length alone did not enforce that contract (a client could submit
 * an http(s) URL or a path-like value). This is a conservative
 * ALLOWLIST -- must start with a letter or digit, followed by any
 * number of letters, digits, '.', '_', or '-' -- rather than a
 * blacklist of specific dangerous forms. It structurally excludes
 * '/', '\', '?', '#', ':', whitespace, and control characters, which
 * is what makes every http(s) URL, URI-scheme value (e.g.
 * "https:example.com", "javascript:...", "urn:...:..."), path-like
 * value, and query/fragment string impossible to express in the first
 * place -- ':' is excluded specifically because it is the URI scheme
 * separator, so no scheme syntax of any kind can be expressed here.
 * Compatible with a plain UUID and with typical bounded token/
 * reference shapes (e.g. "GOV-REF-2026-001"); does NOT imply any
 * particular external reference-issuing provider exists. If a future
 * evidence-storage integration genuinely needs a different syntax,
 * expand this contract only when that integration is implemented and
 * reviewed -- not preemptively.
 */
const OPAQUE_EVIDENCE_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * Candidate Task 0039 (PROVISIONAL). See
 * docs/candidates/0039-pharmacy-onboarding-verification-provisional.md
 *
 * Strict validation throughout: the global validation pipe combines
 * `whitelist` + `forbidNonWhitelisted`, so any unexpected key is
 * rejected -- no DTO here accepts `tenantId`, `providerType`, or any
 * other identity/authorization-relevant field from the client. Those
 * are always server-derived (trusted actor + path parameter only).
 */

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class PharmacyProfileResponseDto {
  @ApiProperty()
  businessName!: string;

  @ApiProperty()
  ownerName!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  phone!: string;

  @ApiProperty()
  address!: string;

  @ApiProperty()
  city!: string;

  @ApiProperty()
  state!: string;

  @ApiProperty()
  country!: string;

  @ApiProperty()
  postalCode!: string;

  @ApiProperty()
  latitude!: number;

  @ApiProperty()
  longitude!: number;
}

export class UpdatePharmacyProfileDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 200 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  businessName?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 200 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  ownerName?: string;

  @ApiPropertyOptional({ maxLength: 254 })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 30 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 300 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  address?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 120 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  city?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 120 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  state?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 120 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  country?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 20 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  postalCode?: string;

  /** The pharmacy's BUSINESS location only -- never an owner/home address (see the candidate document's privacy section). */
  @ApiPropertyOptional({ minimum: -90, maximum: 90 })
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({ minimum: -180, maximum: 180 })
  @IsOptional()
  @IsLongitude()
  longitude?: number;
}

export class SubmitPharmacyVerificationDto {
  @ApiProperty({ minLength: 1, maxLength: 120 })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  licenseNumber!: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString({ strict: true })
  licenseExpiryDate!: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 120 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  businessRegistrationNumber?: string;

  /**
   * A bounded, opaque evidence reference -- NOT a document upload and
   * NOT a public URL. This candidate does not implement secure
   * document storage (see the candidate document §11); production
   * activation of a real document-storage integration is a separate
   * deployment responsibility. This field only records an opaque
   * reference string (e.g. an id issued by that future integration).
   */
  @ApiProperty({ minLength: 1, maxLength: 200 })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(OPAQUE_EVIDENCE_REFERENCE_PATTERN, {
    message:
      'governmentIdReference must be a bounded opaque identifier starting with a letter or digit, followed by letters, digits, "-", "_", or "." -- not a URL, path, or URI scheme value',
  })
  governmentIdReference!: string;
}

export class BeginReviewDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  verificationId!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class ListVerificationQueueDto {
  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;

  @ApiPropertyOptional({ description: 'Opaque deterministic cursor from the previous page' })
  @IsOptional()
  @MaxLength(1024)
  cursor?: string;

  @ApiPropertyOptional({
    enum: ['PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED', 'EXPIRED'],
  })
  @IsOptional()
  @IsIn(['PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED', 'EXPIRED'])
  status?: string;

  /** Bounded safe search by business name -- never by license number or government reference. */
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(120)
  businessNameSearch?: string;
}

export class VerificationSourceDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  authority!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty({ format: 'uri' })
  officialUrl!: string;

  @ApiProperty({ enum: ['PRIMARY', 'SUPPORTING', 'CONDITIONAL'] })
  requirement!: 'PRIMARY' | 'SUPPORTING' | 'CONDITIONAL';

  @ApiProperty({ enum: ['PORTAL_LOOKUP', 'OFFICIAL_DIRECTORY'] })
  mode!: 'PORTAL_LOOKUP' | 'OFFICIAL_DIRECTORY';

  @ApiProperty()
  purpose!: string;

  @ApiProperty()
  limitation!: string;
}

/** Platform reviewer detail view -- includes internal notes, unlike the pharmacy-facing response. */
export class PlatformVerificationDetailResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  providerId!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty()
  businessName!: string;

  @ApiProperty({
    enum: ['PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED', 'EXPIRED'],
  })
  status!: string;

  @ApiProperty()
  licenseNumber!: string;

  @ApiProperty({ format: 'date-time' })
  licenseExpiryDate!: Date;

  @ApiPropertyOptional({ nullable: true })
  businessRegistrationNumber!: string | null;

  @ApiProperty()
  governmentIdReference!: string;

  @ApiPropertyOptional({ nullable: true })
  verificationNotes!: string | null;

  @ApiPropertyOptional({ nullable: true })
  applicantMessage!: string | null;

  @ApiProperty({ format: 'date-time' })
  submittedAt!: Date;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  verifiedAt!: Date | null;

  @ApiProperty()
  version!: number;

  /** Conservative review-time duplicate signal (§31) -- never an automatic rejection. */
  @ApiProperty()
  possibleDuplicateLicenseCount!: number;

  @ApiProperty({ type: [VerificationSourceDto] })
  verificationSources!: readonly VerificationSourceDto[];

  @ApiProperty()
  jurisdictionReviewRequired!: boolean;

  @ApiPropertyOptional({ nullable: true })
  jurisdictionNote!: string | null;
}

export class ApproveVerificationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  verificationId!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class RejectVerificationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  verificationId!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  /** Safely applicant-visible correction guidance. Never platform-internal reasoning. */
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(500)
  applicantMessage?: string;

  /** Internal, platform-reviewer-only notes. Never returned to the applicant. */
  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(1000)
  verificationNotes?: string;
}

export class SuspendVerificationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  verificationId!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(1000)
  verificationNotes?: string;
}

/** Pharmacy-facing read response -- excludes internal verificationNotes. */
/** One verification record's safe, pharmacy-facing projection (never includes internal verificationNotes or reviewer identity). */
export class PharmacyVerificationRecordDto {
  @ApiProperty({ format: 'uuid' })
  verificationId!: string;

  @ApiProperty({
    enum: ['PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED', 'EXPIRED'],
  })
  status!: 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'EXPIRED';

  @ApiProperty({ format: 'date-time' })
  submittedAt!: Date;

  @ApiProperty({ format: 'date-time' })
  licenseExpiryDate!: Date;

  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  applicantMessage!: string | null;

  @ApiProperty()
  version!: number;
}

/**
 * CORRECTION (CTO review, reconciliation, item D): a single flat
 * status is insufficient once a valid current approval can coexist
 * with an open renewal submission -- `current` and `openSubmission`
 * are reported separately so the pharmacy UI can render "Verified
 * until <date> -- renewal pending" without ever falsely showing the
 * pharmacy as unverified while a valid approval remains authoritative.
 */
export class PharmacyVerificationStateResponseDto {
  @ApiPropertyOptional({ type: PharmacyVerificationRecordDto, nullable: true })
  current!: PharmacyVerificationRecordDto | null;

  @ApiPropertyOptional({ type: PharmacyVerificationRecordDto, nullable: true })
  openSubmission!: PharmacyVerificationRecordDto | null;

  @ApiProperty({ type: [VerificationSourceDto] })
  verificationSources!: readonly VerificationSourceDto[];

  @ApiProperty()
  jurisdictionReviewRequired!: boolean;

  @ApiPropertyOptional({ nullable: true })
  jurisdictionNote!: string | null;
}
