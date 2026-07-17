import { Body, Controller, Get, Patch } from '@nestjs/common';
import { UsersService } from './users.service';
import { CurrentUserId } from './decorators/current-user-id.decorator';
import { UpdatePrivacyDto } from './dto/privacy.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me/privacy')
  getPrivacy(@CurrentUserId() userId: string) {
    return this.usersService.getPrivacy(userId);
  }

  @Patch('me/privacy')
  updatePrivacy(@CurrentUserId() userId: string, @Body() dto: UpdatePrivacyDto) {
    return this.usersService.updatePrivacy(userId, dto);
  }
}
