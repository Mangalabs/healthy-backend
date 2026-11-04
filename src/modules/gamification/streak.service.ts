import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { addDaysToKey, localDateKey } from '../../common/utils/date.util';

@Injectable()
export class StreakService {
  constructor(private readonly prisma: PrismaService) {}

  /** Registra atividade no dia local do perfil e atualiza a sequência. */
  async updateStreak(profileId: string, timezone: string): Promise<void> {
    const today = localDateKey(new Date(), timezone);
    const yesterday = addDaysToKey(today, -1);

    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: { streakDays: true, maxStreakDays: true, lastActiveDate: true },
    });

    if (!profile || profile.lastActiveDate === today) return;

    const streakDays =
      profile.lastActiveDate === yesterday ? profile.streakDays + 1 : 1;

    await this.prisma.profile.update({
      where: { id: profileId },
      data: {
        streakDays,
        maxStreakDays: Math.max(profile.maxStreakDays, streakDays),
        lastActiveDate: today,
      },
    });
  }

  /**
   * Sequência efetiva: se o último dia ativo não foi hoje nem ontem,
   * a sequência já foi quebrada, mesmo que o registro ainda não tenha sido atualizado.
   */
  effectiveStreak(
    profile: { streakDays: number; lastActiveDate: string | null },
    timezone: string,
  ): number {
    if (!profile.lastActiveDate) return 0;
    const today = localDateKey(new Date(), timezone);
    const yesterday = addDaysToKey(today, -1);
    return profile.lastActiveDate === today ||
      profile.lastActiveDate === yesterday
      ? profile.streakDays
      : 0;
  }
}
