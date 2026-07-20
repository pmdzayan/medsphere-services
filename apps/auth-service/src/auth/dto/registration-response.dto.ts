import { ApiProperty } from '@nestjs/swagger';

export class RegistrationResponseDto {
  @ApiProperty({
    example: 'If registration is available, onboarding instructions will be sent.',
  })
  message = 'If registration is available, onboarding instructions will be sent.';
}
