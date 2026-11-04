import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../database/prisma.service';
import { TimezoneService } from '../../common/timezone/timezone.service';
import { localDateKey } from '../../common/utils/date.util';
import { StreakService } from './streak.service';

export type HabitAction =
  | 'medication_taken'
  | 'hydration_logged'
  | 'exercise_completed'
  | 'weight_logged';

export interface HabitLoggedPayload {
  profileId: string;
  action: HabitAction;
  /** Identifica o item (ex.: id do remédio) quando a recompensa é por item. */
  refId?: string;
}

interface XpRule {
  xp: number;
  /** Quantas vezes por dia (por refId) a ação rende XP. */
  dailyLimit: number;
}

export const XP_RULES: Record<HabitAction, XpRule> = {
  medication_taken: { xp: 15, dailyLimit: 1 },
  hydration_logged: { xp: 10, dailyLimit: 5 },
  exercise_completed: { xp: 50, dailyLimit: 1 },
  weight_logged: { xp: 10, dailyLimit: 1 },
};

@Injectable()
export class GamificationService {
  private readonly logger = new Logger(GamificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly streakService: StreakService,
    private readonly timezoneService: TimezoneService,
  ) {}

  @OnEvent('habit.logged')
  async handleHabitLoggedEvent(payload: HabitLoggedPayload) {
    const rule = XP_RULES[payload.action];
    if (!rule) return;

    try {
      const timezone = await this.timezoneService.getTimezone(payload.profileId);
      const dayKey = localDateKey(new Date(), timezone);
      const refId = payload.refId ?? '';

      // A sequência conta qualquer hábito registrado, mesmo sem XP novo.
      await this.streakService.updateStreak(payload.profileId, timezone);

      const alreadyAwarded = await this.prisma.xpEvent.count({
        where: {
          profileId: payload.profileId,
          action: payload.action,
          refId,
          dayKey,
        },
      });
      if (alreadyAwarded >= rule.dailyLimit) return;

      await this.prisma.$transaction([
        this.prisma.xpEvent.create({
          data: {
            profileId: payload.profileId,
            action: payload.action,
            refId,
            dayKey,
            xp: rule.xp,
          },
        }),
        this.prisma.profile.update({
          where: { id: payload.profileId },
          data: { currentXp: { increment: rule.xp } },
        }),
      ]);

      this.logger.log(
        `+${rule.xp} XP ao perfil ${payload.profileId} (${payload.action})`,
      );
    } catch (error) {
      this.logger.error(
        `Falha ao processar hábito do perfil ${payload.profileId}`,
        error,
      );
    }
  }
}
