import {
  Controller,
  Get,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { PrismaService } from '../../database/prisma.service';
import { safeTimezone } from '../../common/utils/date.util';
import { levelFromTotalXp } from './level.util';
import { StreakService } from './streak.service';

@UseGuards(JwtAuthGuard)
@Controller('gamification')
export class GamificationController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly streakService: StreakService,
  ) {}

  @Get('status')
  async getStatus(@CurrentUser() user: AuthenticatedUser) {
    const profile = await this.prisma.profile.findUnique({
      where: { id: user.profileId },
      select: {
        currentXp: true,
        streakDays: true,
        maxStreakDays: true,
        lastActiveDate: true,
        timezone: true,
        coins: true,
      },
    });

    if (!profile) {
      throw new NotFoundException('Perfil não encontrado.');
    }

    const progress = levelFromTotalXp(profile.currentXp);

    return {
      totalXp: profile.currentXp,
      level: progress.level,
      xpIntoLevel: progress.xpIntoLevel,
      nextLevelGoal: progress.xpForNextLevel,
      progressPercentage: progress.progressPercentage,
      streakDays: await this.streakService.currentStreak(
        profile,
        user.profileId,
        safeTimezone(profile.timezone),
      ),
      coins: profile.coins,
      maxStreakDays: profile.maxStreakDays,
      lastActiveDate: profile.lastActiveDate,
    };
  }
}
