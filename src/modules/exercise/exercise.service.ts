import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { LogExerciseDto } from './dto/log-exercise.dto';
import { ExerciseLog } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TimezoneService } from '../../common/timezone/timezone.service';
import { localDateKey, startOfLocalDay, addDaysToKey } from '../../common/utils/date.util';

@Injectable()
export class ExerciseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly timezoneService: TimezoneService,
  ) {}

  async logExercise(
    profileId: string,
    dto: LogExerciseDto,
  ): Promise<ExerciseLog> {
    const targetDate = new Date(dto.loggedAt);
    const { start: startOfDay, end: endOfDay } = await this.timezoneService.dayRange(
      profileId,
      targetDate,
    );

    const existingLog = await this.prisma.exerciseLog.findFirst({
      where: {
        profileId,
        loggedAt: { gte: startOfDay, lt: endOfDay },
      },
    });

    let log: ExerciseLog;

    if (existingLog) {
      log = await this.prisma.exerciseLog.update({
        where: { id: existingLog.id },
        data: {
          didExercise: dto.didExercise,
          durationMinutes: dto.durationMinutes,
        },
      });
    } else {
      log = await this.prisma.exerciseLog.create({
        data: {
          profileId,
          didExercise: dto.didExercise,
          durationMinutes: dto.durationMinutes,
          loggedAt: targetDate,
        },
      });
    }

    if (dto.didExercise) {
      await this.eventEmitter.emitAsync('habit.logged', {
        profileId,
        action: 'exercise_completed',
      });
    }

    return log;
  }

  async getDailyStatus(
    profileId: string,
    targetDate: string,
  ): Promise<ExerciseLog | null> {
    const timezone = await this.timezoneService.getTimezone(profileId);
    const dayKey = targetDate
      ? targetDate.slice(0, 10)
      : localDateKey(new Date(), timezone);

    return await this.prisma.exerciseLog.findFirst({
      where: {
        profileId,
        loggedAt: {
          gte: startOfLocalDay(dayKey, timezone),
          lt: startOfLocalDay(addDaysToKey(dayKey, 1), timezone),
        },
      },
      orderBy: { loggedAt: 'desc' },
    });
  }

  async getHistory(
    profileId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<ExerciseLog[]> {
    const where: any = { profileId };

    if (startDate) {
      where.loggedAt = { gte: new Date(startDate) };
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      where.loggedAt = { ...where.loggedAt, lte: end };
    }

    return await this.prisma.exerciseLog.findMany({
      where,
      orderBy: { loggedAt: 'desc' },
      take: startDate || endDate ? undefined : 30,
    });
  }
}
