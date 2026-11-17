import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Goal, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  addDaysToKey,
  localDateKey,
  startOfLocalDay,
} from '../../common/utils/date.util';
import {
  buildCheckpoints,
  directionFor,
  floorWeightKg,
  hasReached,
  rewardTargetFor,
} from '../../common/utils/body.util';
import { COIN_REWARDS, CoinsService } from './coins.service';
import { CreateGoalDto } from './dto/create-goal.dto';

export interface Checkpoint {
  value: number;
  achievedAt: string | null;
}

/** Tempo mínimo entre dois degraus premiados: recompensa constância, não pressa. */
const CHECKPOINT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export function readCheckpoints(goal: Pick<Goal, 'checkpoints'>): Checkpoint[] {
  return Array.isArray(goal.checkpoints)
    ? (goal.checkpoints as unknown as Checkpoint[])
    : [];
}

@Injectable()
export class GoalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coins: CoinsService,
  ) {}

  async list(profileId: string) {
    const goals = await this.prisma.goal.findMany({
      where: { profileId, status: { not: 'CANCELLED' } },
      orderBy: { createdAt: 'desc' },
    });
    return goals.map((g) => this.serialize(g));
  }

  async create(profileId: string, dto: CreateGoalDto) {
    if (dto.type === 'WEEKLY_WORKOUTS') {
      return this.createWeekly(profileId, dto);
    }
    return this.createWeight(profileId, dto);
  }

  private async createWeekly(profileId: string, dto: CreateGoalDto) {
    if (
      !Number.isInteger(dto.targetValue) ||
      dto.targetValue < 1 ||
      dto.targetValue > 7
    ) {
      throw new BadRequestException('Escolha de 1 a 7 treinos por semana.');
    }
    // Só uma meta semanal ativa: a nova substitui a anterior.
    await this.prisma.goal.updateMany({
      where: { profileId, type: 'WEEKLY_WORKOUTS', status: 'ACTIVE' },
      data: { status: 'CANCELLED' },
    });
    const goal = await this.prisma.goal.create({
      data: {
        profileId,
        type: 'WEEKLY_WORKOUTS',
        direction: 'MAINTAIN',
        startValue: 0,
        targetValue: dto.targetValue,
        rewardTarget: dto.targetValue,
      },
    });
    return this.serialize(goal);
  }

  private async createWeight(profileId: string, dto: CreateGoalDto) {
    const profile = await this.prisma.profile.findUniqueOrThrow({
      where: { id: profileId },
      select: { heightCm: true, healthFloorBmi: true },
    });

    let start = dto.startValue;
    if (start === undefined) {
      const latest = await this.prisma.weightLog.findFirst({
        where: { profileId },
        orderBy: { loggedAt: 'desc' },
      });
      if (!latest) {
        throw new BadRequestException(
          'Registre seu peso atual para criar uma meta de peso.',
        );
      }
      start = Number(latest.weightKg);
    }

    const target = dto.targetValue;
    const direction = directionFor(start, target);
    const floorKg =
      profile.heightCm === null
        ? null
        : floorWeightKg(profile.heightCm, Number(profile.healthFloorBmi));

    const belowFloor =
      direction === 'LOSE' && floorKg !== null && target < floorKg;
    if (belowFloor && dto.confirmBelowFloor !== true) {
      throw new UnprocessableEntityException({
        code: 'TARGET_BELOW_FLOOR',
        message:
          'Esse peso fica abaixo do mínimo saudável para a sua altura. ' +
          'Você pode continuar, mas as recompensas vão até ' +
          `${floorKg} kg.`,
        floorKg,
      });
    }

    const rewardTarget = rewardTargetFor(direction, target, floorKg);
    const checkpoints: Checkpoint[] = buildCheckpoints(
      start,
      rewardTarget,
      direction,
    ).map((value) => ({ value, achievedAt: null }));

    // Uma meta de peso ativa por vez: a nova substitui a anterior.
    await this.prisma.goal.updateMany({
      where: { profileId, type: 'WEIGHT', status: 'ACTIVE' },
      data: { status: 'CANCELLED' },
    });
    const goal = await this.prisma.goal.create({
      data: {
        profileId,
        type: 'WEIGHT',
        direction,
        startValue: start,
        targetValue: target,
        rewardTarget,
        checkpoints: checkpoints as unknown as Prisma.InputJsonValue,
      },
    });
    return { ...this.serialize(goal), floorKg, belowFloor };
  }

  async cancel(profileId: string, goalId: string) {
    const goal = await this.prisma.goal.findFirst({
      where: { id: goalId, profileId, status: 'ACTIVE' },
    });
    if (!goal) throw new NotFoundException('Meta não encontrada.');
    const updated = await this.prisma.goal.update({
      where: { id: goalId },
      data: { status: 'CANCELLED' },
    });
    return this.serialize(updated);
  }

  /**
   * Depois de um novo peso: premia o próximo degrau alcançado (no máximo um por
   * semana) e a meta final. Passar do alvo não rende nada a mais.
   */
  async evaluateWeight(profileId: string): Promise<void> {
    const goals = await this.prisma.goal.findMany({
      where: { profileId, type: 'WEIGHT', status: 'ACTIVE' },
    });
    if (goals.length === 0) return;

    const latest = await this.prisma.weightLog.findFirst({
      where: { profileId },
      orderBy: { loggedAt: 'desc' },
    });
    if (!latest) return;
    const weight = Number(latest.weightKg);
    const now = new Date();

    for (const goal of goals) {
      const direction = goal.direction;
      if (direction === 'MAINTAIN') continue;
      const checkpoints = readCheckpoints(goal);

      if (hasReached(direction, weight, Number(goal.rewardTarget))) {
        const closed = checkpoints.map((c) => ({
          ...c,
          achievedAt: c.achievedAt ?? now.toISOString(),
        }));
        await this.coins.award(
          profileId,
          'weight_target',
          goal.id,
          COIN_REWARDS.weightTarget,
        );
        await this.prisma.goal.update({
          where: { id: goal.id },
          data: {
            status: 'ACHIEVED',
            achievedAt: now,
            checkpoints: closed as unknown as Prisma.InputJsonValue,
          },
        });
        continue;
      }

      const next = checkpoints.find((c) => c.achievedAt === null);
      if (!next || !hasReached(direction, weight, next.value)) continue;

      const lastAward = checkpoints
        .map((c) => (c.achievedAt ? Date.parse(c.achievedAt) : 0))
        .reduce((a, b) => Math.max(a, b), 0);
      if (lastAward && now.getTime() - lastAward < CHECKPOINT_COOLDOWN_MS) {
        continue;
      }

      await this.coins.award(
        profileId,
        'weight_checkpoint',
        `${goal.id}:${next.value}`,
        COIN_REWARDS.weightCheckpoint,
      );
      next.achievedAt = now.toISOString();
      await this.prisma.goal.update({
        where: { id: goal.id },
        data: { checkpoints: checkpoints as unknown as Prisma.InputJsonValue },
      });
    }
  }

  /** Depois de um treino: se fechou a meta semanal, paga uma vez por semana. */
  async evaluateWeekly(profileId: string, timezone: string): Promise<void> {
    const goal = await this.prisma.goal.findFirst({
      where: { profileId, type: 'WEEKLY_WORKOUTS', status: 'ACTIVE' },
    });
    if (!goal) return;

    const { weekKey, start, end } = weekRange(timezone);
    const done = await this.prisma.exerciseLog.count({
      where: {
        profileId,
        didExercise: true,
        loggedAt: { gte: start, lt: end },
      },
    });
    if (done >= Number(goal.targetValue)) {
      await this.coins.award(
        profileId,
        'weekly_workouts',
        `${goal.id}:${weekKey}`,
        COIN_REWARDS.weeklyWorkouts,
      );
    }
  }

  private serialize(goal: Goal) {
    return {
      id: goal.id,
      type: goal.type,
      direction: goal.direction,
      status: goal.status,
      startValue: Number(goal.startValue),
      targetValue: Number(goal.targetValue),
      rewardTarget: Number(goal.rewardTarget),
      checkpoints: readCheckpoints(goal),
      startedAt: goal.startedAt,
      achievedAt: goal.achievedAt,
    };
  }
}

/** Semana local de segunda a domingo que contém hoje. */
export function weekRange(timezone: string, reference: Date = new Date()) {
  const today = localDateKey(reference, timezone);
  const [y, m, d] = today.split('-').map(Number);
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // 0 = segunda
  const weekKey = addDaysToKey(today, -weekday);
  return {
    weekKey,
    start: startOfLocalDay(weekKey, timezone),
    end: startOfLocalDay(addDaysToKey(weekKey, 7), timezone),
  };
}
