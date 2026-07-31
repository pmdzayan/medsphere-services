import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedIdentity } from '../auth/auth.types';
import { CurrentIdentity } from '../common/decorators/current-identity.decorator';
import { AuthorizationService } from './authorization.service';
import { EffectivePermissionsResponseDto } from './dto/authorization-response.dto';

@Controller('authorization')
@ApiTags('Authorization')
@ApiBearerAuth()
export class AuthorizationContextController {
  constructor(private readonly authorizationService: AuthorizationService) {}

  @Get('effective-permissions')
  @ApiOperation({ summary: 'Read effective permissions for the authenticated tenant membership' })
  @ApiOkResponse({ type: EffectivePermissionsResponseDto })
  effectivePermissions(
    @CurrentIdentity() identity: AuthenticatedIdentity,
  ): Promise<EffectivePermissionsResponseDto> {
    return this.authorizationService.listEffectivePermissions(identity);
  }
}
