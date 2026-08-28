import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class IssueOrganizationJoinCodeDto {
  @ApiPropertyOptional({
    description: 'Optional ISO-8601 expiry; must be in the future and no more than one year away',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  expiresAt?: string;
}
