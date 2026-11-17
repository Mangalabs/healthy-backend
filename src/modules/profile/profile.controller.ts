import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { ProfileService } from './profile.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { serializeProfile } from './profile.serializer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('profile')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  async getMyProfile(@CurrentUser() user: AuthenticatedUser) {
    if (!user || !user.profileId) {
      throw new UnauthorizedException(
        'Sessão inválida ou usuário não encontrado.',
      );
    }
    return serializeProfile(
      await this.profileService.getProfile(user.profileId),
    );
  }

  @Patch()
  async updateMyProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    if (!user || !user.profileId) {
      throw new UnauthorizedException(
        'Sessão inválida ou usuário não encontrado.',
      );
    }
    return serializeProfile(
      await this.profileService.updateProfile(user.profileId, dto),
    );
  }
}
