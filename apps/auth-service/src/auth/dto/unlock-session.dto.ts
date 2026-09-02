import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ExactlyOneOf } from './exactly-one-of.validator';

const REFRESH_CREDENTIAL_PATTERN =
  /^msr\.([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/;

/**
 * Task 0014: secure unlock / re-authentication request.
 *
 * Exact-one-credential enforcement: exactly one of `password` OR
 * `googleIdToken` must be present. Zero credential mechanisms and multiple
 * conflicting mechanisms are both rejected at the boundary. The refresh
 * token is the currently-locked session's opaque single-use credential and
 * is consumed by the unlock rotation.
 */
export class UnlockSessionDto {
  @ApiProperty({ format: 'password', minLength: 15, maxLength: 128 })
  @ValidateIf((dto: UnlockSessionDto) => dto.googleIdToken === undefined)
  @IsString()
  @MinLength(15)
  @MaxLength(128)
  password?: string;

  @ApiProperty({ maxLength: 10000 })
  @ValidateIf((dto: UnlockSessionDto) => dto.password === undefined)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(10000)
  googleIdToken?: string;

  @ApiProperty({ description: 'Opaque single-use refresh credential of the locked session' })
  @ExactlyOneOf(['password', 'googleIdToken'])
  @IsString()
  @Matches(REFRESH_CREDENTIAL_PATTERN)
  refreshToken!: string;
}
