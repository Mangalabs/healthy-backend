import { Injectable, NotFoundException } from '@nestjs/common';
import { MealLog } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../database/prisma.service';
import { TimezoneService } from '../../common/timezone/timezone.service';
import {
  addDaysToKey,
  localDateKey,
  startOfLocalDay,
} from '../../common/utils/date.util';
import { LogMealDto } from './dto/log-meal.dto';

@Injectable()
export class MealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly timezoneService: TimezoneService,
  ) {}

  /**
   * Marca uma refeição do dia. Cada tipo conta uma vez por dia: marcar de novo
   * devolve a marcação existente, sem XP em dobro.
   */
  async log(profileId: string, dto: LogMealDto): Promise<MealLog> {
    const targetDate = new Date(dto.loggedAt);
    const { start, end } = await this.timezoneService.dayRange(
      profileId,
      targetDate,
    );

    const existing = await this.prisma.mealLog.findFirst({
      where: {
        profileId,
        mealType: dto.mealType,
        loggedAt: { gte: start, lt: end },
      },
    });
    if (existing) return existing;

    const log = await this.prisma.mealLog.create({
      data: { profileId, mealType: dto.mealType, loggedAt: targetDate },
    });
    await this.eventEmitter.emitAsync('habit.logged', {
      profileId,
      action: 'meal_logged',
    });
    return log;
  }

  /** Desfaz uma marcação feita por engano. O XP e as moedas já pagos ficam. */
  async remove(profileId: string, id: string): Promise<{ id: string }> {
    const result = await this.prisma.mealLog.deleteMany({
      where: { id, profileId },
    });
    if (result.count === 0) {
      throw new NotFoundException('Refeição não encontrada.');
    }
    return { id };
  }

  async getDaily(profileId: string, targetDate?: string): Promise<MealLog[]> {
    const timezone = await this.timezoneService.getTimezone(profileId);
    const dayKey = targetDate
      ? targetDate.slice(0, 10)
      : localDateKey(new Date(), timezone);

    return this.prisma.mealLog.findMany({
      where: {
        profileId,
        loggedAt: {
          gte: startOfLocalDay(dayKey, timezone),
          lt: startOfLocalDay(addDaysToKey(dayKey, 1), timezone),
        },
      },
      orderBy: { loggedAt: 'asc' },
    });
  }

  async getHistory(
    profileId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<MealLog[]> {
    const where: { profileId: string; loggedAt?: { gte?: Date; lte?: Date } } =
      { profileId };
    if (startDate) where.loggedAt = { gte: new Date(startDate) };
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      where.loggedAt = { ...where.loggedAt, lte: end };
    }
    return this.prisma.mealLog.findMany({
      where,
      orderBy: { loggedAt: 'desc' },
      take: startDate || endDate ? undefined : 60,
    });
  }
}
