import { Injectable } from '@nestjs/common';

import { UsersRepository } from '../users/users.repository';
import { PasswordService } from './password.service';
import { RegisterDto } from './dto/register.dto';
import { RegistrationResponseDto } from './dto/registration-response.dto';

@Injectable()
export class RegistrationService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly passwordService: PasswordService,
  ) {}

  async register(registerDto: RegisterDto): Promise<RegistrationResponseDto> {
    // Hash before policy/existence handling so public responses do not expose
    // a materially different fast path for unknown tenants or existing users.
    const passwordHash = await this.passwordService.hash(registerDto.password);

    await this.usersRepository.createPendingRegistration({
      tenantSlug: registerDto.tenantSlug,
      email: registerDto.email,
      passwordHash,
      firstName: registerDto.firstName,
      lastName: registerDto.lastName,
    });

    return new RegistrationResponseDto();
  }
}
