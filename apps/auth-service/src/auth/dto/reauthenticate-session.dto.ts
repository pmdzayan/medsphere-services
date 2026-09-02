import { Transform } from 'class-transformer';
import { Equals, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { ApiHideProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ExactlyOneOf } from './exactly-one-of.validator';

/**
 * Task 0014: credential proof for an already-active authenticated session.
 *
 * Exactly one of password or Google identity token must be supplied.
 * No refresh credential or client-provided session identity is accepted.
 */
export class ReauthenticateSessionDto {
  @ApiPropertyOptional({ format: 'password', minLength: 15, maxLength: 128 })
  @ValidateIf((dto: ReauthenticateSessionDto) => dto.googleIdToken === undefined)
  @IsString()
  @MinLength(15)
  @MaxLength(128)
  password?: string;

  @ApiPropertyOptional({ maxLength: 10000 })
  @ValidateIf((dto: ReauthenticateSessionDto) => dto.password === undefined)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(10000)
  googleIdToken?: string;

  /*
   * Internal validation sentinel. It exists only so class-validator can run
   * the cross-field rule even though neither credential field is individually
   * required. Client input for this property is always rejected.
   */
  @ApiHideProperty()
  @ExactlyOneOf(['password', 'googleIdToken'])
  @Equals(undefined)
  credentialSelection?: never;
}
