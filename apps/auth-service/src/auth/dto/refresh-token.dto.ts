import { IsString, Matches, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'Single-use opaque refresh credential returned by login or refresh',
    maxLength: 100,
    format: 'password',
  })
  @IsString()
  @MaxLength(100)
  @Matches(
    /^msr\.[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[A-Za-z0-9_-]{43}$/,
  )
  refreshToken!: string;
}
