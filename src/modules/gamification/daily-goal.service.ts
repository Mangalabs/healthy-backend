import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  addDaysToKey,
  localDateKey,
  localDayRange,
  safeTimezone,
  startOfLocalDay,
} from '../../common/utils/date.util';
import { activeModules } from '../profile/profile.serializer';
import { COIN_REWARDS, CoinsService } from './coins.service';
import { StreakService } from './streak.service';

export type DailyTaskKey = 'hydration' | 'medication' | 'exercise' | 'meals';

export interface DailyTask {
  key: DailyTaskKey;
  current: number;
  target: number;
  done: boolean;
}

/** Teto de XP por dia: a constância rende, o exagero não. */
export const DAILY_XP_CAP = 150;
/** Bônus de XP por fechar a meta do dia (fora do teto). */
export const DAILY_GOAL_BONUS_XP = 20;
export const DAILY_GOAL_BONUS_ACTION = 'daily_goal_complete';

/** Refeições a marcar por dia para fechar a tarefa (café, almoço, jantar...). */
const MEALS_PER_DAY = 3;

const TASK_COINS: Record<DailyTaskKey, number> = {
  hydration: COIN_REWARDS.taskHydration,
  medication: COIN_REWARDS.taskMedication,
  exercise: COIN_REWARDS.taskExercise,
  meals: COIN_REWARDS.taskMeals,
};

@Injectable()
export class DailyGoalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly streak: StreakService,
    private readonly coins: CoinsService,
  ) {}

  /** Visão do dia: tarefas dos módulos ativos, progresso, sequência e descanso. */
  async today(profileId: string) {
    const profile = await this.prisma.profile.findUniqueOrThrow({
      where: { id: profileId },
      select: {
        timezone: true,
        dailyHydrationGoal: true,
        trackedModules: true,
        setupCompletedAt: true,
        streakDays: true,
        lastActiveDate: true,
        coins: true,
      },
    });
    const timezone = safeTimezone(profile.timezone);
    const range = localDayRange(timezone);
    const modules = activeModules(profile);

    const tasks = await this.buildTasks(
      profileId,
      modules,
      profile.dailyHydrationGoal,
      range,
    );
    const complete = tasks.length > 0 && tasks.every((t) => t.done);

    const [xpToday, coinsToday, restToday, restLastWeek, anyHabit] =
      await Promise.all([
        this.prisma.xpEvent.aggregate({
          _sum: { xp: true },
          where: { profileId, dayKey: range.key },
        }),
        this.prisma.coinEvent.aggregate({
          _sum: { amount: true },
          where: {
            profileId,
            amount: { gt: 0 },
            createdAt: { gte: range.start, lt: range.end },
          },
        }),
        this.prisma.restDay.count({
          where: { profileId, dayKey: range.key },
        }),
        this.prisma.restDay.count({
          where: {
            profileId,
            dayKey: { gte: addDaysToKey(range.key, -6), lte: range.key },
          },
        }),
        this.prisma.xpEvent.count({
          where: {
            profileId,
            dayKey: range.key,
            action: { not: DAILY_GOAL_BONUS_ACTION },
          },
        }),
      ]);

    // Sem tarefas (nenhum módulo com meta), qualquer hábito do dia vale.
    const minimumMet =
      tasks.length > 0 ? tasks.some((t) => t.done) : anyHabit > 0;
    const restDay = restToday > 0;

    return {
      dayKey: range.key,
      modules,
      tasks,
      complete,
      minimumMet,
      restDay,
      restDayAvailable: !restDay && !minimumMet && restLastWeek === 0,
      xpToday: xpToday._sum.xp ?? 0,
      xpCap: DAILY_XP_CAP,
      coinsToday: coinsToday._sum.amount ?? 0,
      coins: profile.coins,
      streakDays: await this.streak.currentStreak(profile, profileId, timezone),
    };
  }

  private async buildTasks(
    profileId: string,
    modules: string[],
    hydrationGoal: number,
    range: { start: Date; end: Date },
  ): Promise<DailyTask[]> {
    const today = { gte: range.start, lt: range.end };
    const tasks: DailyTask[] = [];

    if (modules.includes('HYDRATION')) {
      const water = await this.prisma.hydrationLog.aggregate({
        _sum: { amountMl: true },
        where: { profileId, loggedAt: today },
      });
      const current = water._sum.amountMl ?? 0;
      tasks.push({
        key: 'hydration',
        current,
        target: hydrationGoal,
        done: current >= hydrationGoal,
      });
    }

    if (modules.includes('MEDICATION')) {
      const target = await this.prisma.medication.count({
        where: {
          profileId,
          isActive: true,
          deletedAt: null,
          frequency: 'DAILY',
        },
      });
      if (target > 0) {
        const taken = await this.prisma.medicationLog.findMany({
          where: {
            profileId,
            status: 'TAKEN',
            loggedAt: today,
            medication: { frequency: 'DAILY', isActive: true, deletedAt: null },
          },
          select: { medicationId: true },
          distinct: ['medicationId'],
        });
        tasks.push({
          key: 'medication',
          current: taken.length,
          target,
          done: taken.length >= target,
        });
      }
    }

    if (modules.includes('EXERCISE')) {
      const exercised = await this.prisma.exerciseLog.count({
        where: { profileId, didExercise: true, loggedAt: today },
      });
      tasks.push({
        key: 'exercise',
        current: exercised > 0 ? 1 : 0,
        target: 1,
        done: exercised > 0,
      });
    }

    if (modules.includes('MEALS')) {
      // Só presença: quantos tipos de refeição a pessoa marcou hoje.
      const logged = await this.prisma.mealLog.findMany({
        where: { profileId, loggedAt: today },
        select: { mealType: true },
        distinct: ['mealType'],
      });
      tasks.push({
        key: 'meals',
        current: logged.length,
        target: MEALS_PER_DAY,
        done: logged.length >= MEALS_PER_DAY,
      });
    }

    return tasks;
  }

  /**
   * Últimos `days` dias (do mais antigo ao de hoje): quantas tarefas foram
   * feitas em cada um e há quantos dias a pessoa não registra nada. O pet usa
   * isso para saber como a pessoa vem se cuidando; dias de descanso não contam
   * como falta.
   */
  async history(profileId: string, days = 7) {
    const profile = await this.prisma.profile.findUniqueOrThrow({
      where: { id: profileId },
      select: {
        timezone: true,
        dailyHydrationGoal: true,
        trackedModules: true,
        setupCompletedAt: true,
      },
    });
    const timezone = safeTimezone(profile.timezone);
    const modules = activeModules(profile);
    const todayKey = localDateKey(new Date(), timezone);
    const count = Math.min(Math.max(Math.trunc(days) || 7, 1), 30);

    const result: {
      dayKey: string;
      tasksTotal: number;
      tasksDone: number;
      tasks: DailyTask[];
      anyHabit: boolean;
      restDay: boolean;
    }[] = [];
    for (let i = count - 1; i >= 0; i--) {
      const dayKey = addDaysToKey(todayKey, -i);
      const range = {
        start: startOfLocalDay(dayKey, timezone),
        end: startOfLocalDay(addDaysToKey(dayKey, 1), timezone),
      };
      const tasks = await this.buildTasks(
        profileId,
        modules,
        profile.dailyHydrationGoal,
        range,
      );
      const [habits, rest] = await Promise.all([
        this.prisma.xpEvent.count({
          where: {
            profileId,
            dayKey,
            action: { not: DAILY_GOAL_BONUS_ACTION },
          },
        }),
        this.prisma.restDay.count({ where: { profileId, dayKey } }),
      ]);
      result.push({
        dayKey,
        tasksTotal: tasks.length,
        tasksDone: tasks.filter((t) => t.done).length,
        tasks,
        anyHabit: habits > 0,
        restDay: rest > 0,
      });
    }

    const last = await this.prisma.xpEvent.findFirst({
      where: { profileId, action: { not: DAILY_GOAL_BONUS_ACTION } },
      orderBy: { dayKey: 'desc' },
      select: { dayKey: true },
    });
    let daysSinceActivity: number | null = null;
    if (last) {
      const rested = new Set(
        (
          await this.prisma.restDay.findMany({
            where: { profileId, dayKey: { gt: last.dayKey, lte: todayKey } },
            select: { dayKey: true },
          })
        ).map((r) => r.dayKey),
      );
      let gap = 0;
      for (
        let cursor = addDaysToKey(last.dayKey, 1);
        cursor <= todayKey && gap < 400;
        cursor = addDaysToKey(cursor, 1)
      ) {
        if (!rested.has(cursor)) gap++;
      }
      daysSinceActivity = gap;
    }

    return { days: result, daysSinceActivity };
  }

  /**
   * Chamado depois de cada hábito registrado: paga as moedas das tarefas
   * concluídas, o bônus de fechar o dia e conta o dia na sequência quando a
   * meta mínima foi cumprida. Tudo idempotente.
   */
  async afterHabit(profileId: string, timezone: string): Promise<void> {
    const state = await this.today(profileId);

    for (const task of state.tasks) {
      if (task.done) {
        await this.coins.award(
          profileId,
          `task_${task.key}`,
          state.dayKey,
          TASK_COINS[task.key],
        );
      }
    }

    if (state.complete) {
      await this.coins.award(
        profileId,
        'daily_goal',
        state.dayKey,
        COIN_REWARDS.dailyGoal,
      );
      await this.awardCompletionXp(profileId, state.dayKey);
    }

    if (state.minimumMet) {
      await this.streak.updateStreak(profileId, timezone);
    }
  }

  private async awardCompletionXp(profileId: string, dayKey: string) {
    const already = await this.prisma.xpEvent.count({
      where: { profileId, dayKey, action: DAILY_GOAL_BONUS_ACTION },
    });
    if (already > 0) return;
    await this.prisma.$transaction([
      this.prisma.xpEvent.create({
        data: {
          profileId,
          action: DAILY_GOAL_BONUS_ACTION,
          refId: '',
          dayKey,
          xp: DAILY_GOAL_BONUS_XP,
        },
      }),
      this.prisma.profile.update({
        where: { id: profileId },
        data: { currentXp: { increment: DAILY_GOAL_BONUS_XP } },
      }),
    ]);
  }

  /** Marca hoje como dia de descanso: a sequência não quebra. */
  async setRestDay(profileId: string) {
    const state = await this.today(profileId);
    if (state.restDay) return state;
    if (state.minimumMet) {
      throw new BadRequestException(
        'Hoje você já cumpriu a meta, não precisa de descanso.',
      );
    }
    if (!state.restDayAvailable) {
      throw new BadRequestException(
        'Você já descansou nos últimos 7 dias. Volte amanhã com calma!',
      );
    }
    await this.prisma.restDay.create({
      data: { profileId, dayKey: state.dayKey },
    });
    return this.today(profileId);
  }
}
