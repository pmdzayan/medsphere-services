import { Body, Controller, Get, Patch } from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdatePrivacyDto } from './dto/privacy.dto';
import { UpdateLanguageDto } from '../localization/dto/update-language.dto';
import { CurrentIdentity } from '../common/decorators/current-identity.decorator';
import { AuthenticatedIdentity } from '../auth/auth.types';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { PrivacyResponseDto } from './dto/privacy.dto';
import { LanguageUpdateResponseDto } from '../localization/dto/update-language.dto';

@Controller('users')
@ApiTags('Current User')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Authentication required' })
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me/privacy')
  @ApiOperation({ summary: 'Read the authenticated user privacy preferences' })
  @ApiOkResponse({ type: PrivacyResponseDto })
  getPrivacy(@CurrentIdentity() identity: AuthenticatedIdentity) {
    return this.usersService.getPrivacy(identity.userId);
  }

  @Patch('me/privacy')
  @ApiOperation({ summary: 'Update the authenticated user privacy preferences' })
  @ApiOkResponse({ type: PrivacyResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid or empty privacy update' })
  updatePrivacy(@CurrentIdentity() identity: AuthenticatedIdentity, @Body() dto: UpdatePrivacyDto) {
    return this.usersService.updatePrivacy(identity, dto);
  }

  @Patch('me/language')
  @ApiOperation({ summary: 'Update the authenticated user language' })
  @ApiOkResponse({ type: LanguageUpdateResponseDto })
  updateLanguage(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Body() dto: UpdateLanguageDto,
  ) {
    return this.usersService.updateLanguage(identity.userId, dto);
  }
}
