import { ConflictException, Injectable } from '@nestjs/common';

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
    const existingUser = await this.usersRepository.findByEmail(
      registerDto.tenantId,
      registerDto.email,
    );

    if (existingUser) {
      throw new ConflictException('User already exists');
    }

    const passwordHash = await this.passwordService.hash(registerDto.password);

    const user = await this.usersRepository.create({
      tenantId: registerDto.tenantId,
      email: registerDto.email,
      passwordHash,
      firstName: registerDto.firstName,
      lastName: registerDto.lastName,
    });

    const updatedUser = await this.usersRepository.update(user.id, {
      status: 'PENDING_VERIFICATION',
    });

    return new RegistrationResponseDto({
      id: updatedUser.id,
      email: updatedUser.email,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      status: updatedUser.status,
      createdAt: updatedUser.createdAt,
    });
  }
}
