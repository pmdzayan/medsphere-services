import { Body, Controller, Get, Header, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentIdentity } from '../common/decorators/current-identity.decorator';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import { PatientProfileService } from './patient-profile.service';
import { PatientProfileResponseDto, UpdatePatientProfileDto } from './dto/patient-profile.dto';

/**
 * Candidate Task 0032 (pre-0031): self-service profile for the
 * currently authenticated global identity. No permission decorator is
 * applied -- every authenticated user (already enforced globally by
 * JwtAuthGuard as an APP_GUARD) may read and update their OWN
 * profile; there is no notion of "managing someone else's profile"
 * here, so RBAC permission checks do not apply to this resource.
 * Every method is scoped exclusively by @CurrentIdentity() -- there is
 * no route parameter, body field, or header that can select a
 * different target user.
 */
@Controller('patient/profile')
@ApiTags('Patient Profile (candidate)')
@ApiBearerAuth()
export class PatientProfileController {
  constructor(private readonly profile: PatientProfileService) {}

  @Get()
  @Header('cache-control', 'private, no-store')
  @ApiOperation({ summary: "Read the authenticated user's own patient profile" })
  @ApiOkResponse({ type: PatientProfileResponseDto })
  getOwnProfile(@CurrentIdentity() identity: AuthenticatedIdentity) {
    return this.profile.getOwnProfile(identity);
  }

  @Patch()
  @Header('cache-control', 'private, no-store')
  @ApiOperation({
    summary:
      "Update only the whitelisted, patient-mutable fields of the authenticated user's own profile",
  })
  @ApiOkResponse({ type: PatientProfileResponseDto })
  updateOwnProfile(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Body() dto: UpdatePatientProfileDto,
  ) {
    return this.profile.updateOwnProfile(identity, dto);
  }
}
