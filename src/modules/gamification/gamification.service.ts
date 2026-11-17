import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../database/prisma.service';
import { TimezoneService } from '../../common/timezone/timezone.service';
import { localDateKey } from '../../common/utils/date.util';
import {
  DAILY_GOAL_BONUS_ACTION,
  DAILY_XP_CAP,
  DailyGoalService,
} from './daily-goal.service';
import { GoalsService } from './goals.service';

export type HabitAction =
  | 'medication_taken'
  | 'hydration_logged'
  | 'exercise_completed'
  | 'weight_logged'
  | 'meal_logged';

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

/**
 * XP premia constância, não resultado: nada aqui depende do valor do peso, de
 * comer menos ou de emagrecer. O total diário tem teto (DAILY_XP_CAP).
 */
export const XP_RULES: Record<HabitAction, XpRule> = {
  medication_taken: { xp: 15, dailyLimit: 1 },
  hydration_logged: { xp: 10, dailyLimit: 5 },
  exercise_completed: { xp: 50, dailyLimit: 1 },
  weight_logged: { xp: 10, dailyLimit: 1 },
  meal_logged: { xp: 8, dailyLimit: 1 },
};

@Injectable()
export class GamificationService {
  private readonly logger = new Logger(GamificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly timezoneService: TimezoneService,
    private readonly dailyGoals: DailyGoalService,
    private readonly goals: GoalsService,
  ) {}

  @OnEvent('habit.logged')
  async handleHabitLoggedEvent(payload: HabitLoggedPayload) {
    const rule = XP_RULES[payload.action];
    if (!rule) return;

    try {
      const timezone = await this.timezoneService.getTimezone(
        payload.profileId,
      );
      const dayKey = localDateKey(new Date(), timezone);

      await this.awardXp(payload, rule, dayKey);

      // Metas e moedas: cada passo é idempotente e independente do XP do dia.
      await this.dailyGoals.afterHabit(payload.profileId, timezone);
      if (payload.action === 'weight_logged') {
        await this.goals.evaluateWeight(payload.profileId);
      }
      if (payload.action === 'exercise_completed') {
        await this.goals.evaluateWeekly(payload.profileId, timezone);
      }
    } catch (error) {
      this.logger.error(
        `Falha ao processar hábito do perfil ${payload.profileId}`,
        error,
      );
    }
  }

  private async awardXp(
    payload: HabitLoggedPayload,
    rule: XpRule,
    dayKey: string,
  ) {
    const { profileId, action } = payload;
    const refId = payload.refId ?? '';

    const alreadyAwarded = await this.prisma.xpEvent.count({
      where: { profileId, action, refId, dayKey },
    });
    if (alreadyAwarded >= rule.dailyLimit) return;

    const used = await this.prisma.xpEvent.aggregate({
      _sum: { xp: true },
      where: { profileId, dayKey, action: { not: DAILY_GOAL_BONUS_ACTION } },
    });
    const room = DAILY_XP_CAP - (used._sum.xp ?? 0);
    if (room <= 0) return;
    const xp = Math.min(rule.xp, room);

    await this.prisma.$transaction([
      this.prisma.xpEvent.create({
        data: { profileId, action, refId, dayKey, xp },
      }),
      this.prisma.profile.update({
        where: { id: profileId },
        data: { currentXp: { increment: xp } },
      }),
    ]);

    this.logger.log(`+${xp} XP ao perfil ${profileId} (${action})`);
  }
}
