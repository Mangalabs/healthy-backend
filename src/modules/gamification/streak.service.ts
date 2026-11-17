import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { addDaysToKey, localDateKey } from '../../common/utils/date.util';

/** Quantos dias de descanso seguidos a sequência aguenta entre dois dias ativos. */
const MAX_GAP_DAYS = 7;

@Injectable()
export class StreakService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Dias entre `from` e `to`, sem incluir nenhum dos dois. Lista vazia quando
   * os dias são vizinhos ou iguais.
   */
  private daysBetween(from: string, to: string): string[] {
    const days: string[] = [];
    let cursor = addDaysToKey(from, 1);
    while (cursor < to && days.length <= MAX_GAP_DAYS) {
      days.push(cursor);
      cursor = addDaysToKey(cursor, 1);
    }
    return days;
  }

  /**
   * A sequência segue de pé se todos os dias entre o último dia ativo e `until`
   * (sem contar `until`) foram dias de descanso.
   */
  private async gapIsCovered(
    profileId: string,
    lastActive: string,
    until: string,
  ): Promise<boolean> {
    const gap = this.daysBetween(lastActive, until);
    if (gap.length === 0) return true;
    if (gap.length > MAX_GAP_DAYS) return false;
    const rested = await this.prisma.restDay.count({
      where: { profileId, dayKey: { in: gap } },
    });
    return rested === gap.length;
  }

  /**
   * Conta o dia local de hoje na sequência. Só deve ser chamado quando a meta
   * mínima do dia foi cumprida (veja DailyGoalService).
   */
  async updateStreak(profileId: string, timezone: string): Promise<void> {
    const today = localDateKey(new Date(), timezone);

    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: { streakDays: true, maxStreakDays: true, lastActiveDate: true },
    });

    if (!profile || profile.lastActiveDate === today) return;

    const continues =
      profile.lastActiveDate !== null &&
      profile.lastActiveDate < today &&
      (await this.gapIsCovered(profileId, profile.lastActiveDate, today));
    const streakDays = continues ? profile.streakDays + 1 : 1;

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
   * Sequência efetiva: se o último dia ativo ficou para trás sem dias de
   * descanso cobrindo o intervalo, a sequência já foi quebrada, mesmo que o
   * registro ainda não tenha sido atualizado. Hoje ainda está em andamento.
   */
  async currentStreak(
    profile: { streakDays: number; lastActiveDate: string | null },
    profileId: string,
    timezone: string,
  ): Promise<number> {
    if (!profile.lastActiveDate) return 0;
    const today = localDateKey(new Date(), timezone);
    if (profile.lastActiveDate >= today) return profile.streakDays;
    return (await this.gapIsCovered(profileId, profile.lastActiveDate, today))
      ? profile.streakDays
      : 0;
  }
}
