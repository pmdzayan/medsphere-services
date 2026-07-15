import { ConflictException, Injectable } from '@nestjs/common';
import { AuthRepository } from './auth.repository';
import { UsersRepository } from '../users/users.repository';
import { PasswordService } from './password.service';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly usersRepository: UsersRepository,
    private readonly passwordService: PasswordService,
  ) {}

  async register(registerDto: RegisterDto) {
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

    return user;
  }
}
