import { Injectable } from '@nestjs/common';

import { OrganizationOnboardingService } from '../organization/organization-onboarding.service';
import { PasswordService } from './password.service';
import { AuthConfigService } from './auth-config.service';
import { RegisterDto } from './dto/register.dto';
import { RegistrationResponseDto } from './dto/registration-response.dto';

@Injectable()
export class RegistrationService {
  constructor(
    private readonly organizationOnboarding: OrganizationOnboardingService,
    private readonly passwordService: PasswordService,
    private readonly authConfig: AuthConfigService,
  ) {}

  async register(registerDto: RegisterDto): Promise<RegistrationResponseDto> {
    // Hash before policy/existence handling so public responses do not expose
    // a materially different fast path for unknown organizations or existing
    // users.
    const passwordHash = await this.passwordService.hash(registerDto.password);

    await this.organizationOnboarding.registerWithPassword({
      organizationType: registerDto.organizationType,
      organizationCode: registerDto.organizationCode,
      email: registerDto.email,
      phone: registerDto.phone,
      passwordHash,
      firstName: registerDto.firstName,
      lastName: registerDto.lastName,
      orgJoinCodePepper: this.authConfig.value.orgJoinCodePepper,
    });

    return new RegistrationResponseDto();
  }
}
