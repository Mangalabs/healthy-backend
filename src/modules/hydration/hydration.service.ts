import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { LogHydrationDto } from './dto/log-hydration.dto';
import { HydrationLog } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TimezoneService } from '../../common/timezone/timezone.service';
import { localDateKey, startOfLocalDay, addDaysToKey } from '../../common/utils/date.util';

@Injectable()
export class HydrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly timezoneService: TimezoneService,
  ) {}

  async logConsumption(
    profileId: string,
    dto: LogHydrationDto,
  ): Promise<HydrationLog> {
    const log = await this.prisma.hydrationLog.create({
      data: {
        profileId,
        amountMl: dto.amountMl,
        containerType: dto.containerType || 'glass',
        loggedAt: new Date(dto.loggedAt),
      },
    });

    await this.eventEmitter.emitAsync('habit.logged', {
      profileId,
      action: 'hydration_logged',
    });

    return log;
  }

  async getDailySummary(
    profileId: string,
    targetDate: string,
  ): Promise<{ totalMl: number }> {
    const timezone = await this.timezoneService.getTimezone(profileId);
    const dayKey = targetDate
      ? targetDate.slice(0, 10)
      : localDateKey(new Date(), timezone);

    const logs = await this.prisma.hydrationLog.aggregate({
      _sum: { amountMl: true },
      where: {
        profileId,
        loggedAt: {
          gte: startOfLocalDay(dayKey, timezone),
          lt: startOfLocalDay(addDaysToKey(dayKey, 1), timezone),
        },
      },
    });

    return { totalMl: logs._sum.amountMl || 0 };
  }

  async getHistory(
    profileId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<HydrationLog[]> {
    const where: any = { profileId };

    if (startDate) {
      where.loggedAt = { gte: new Date(startDate) };
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      where.loggedAt = { ...where.loggedAt, lte: end };
    }

    return await this.prisma.hydrationLog.findMany({
      where,
      orderBy: { loggedAt: 'desc' },
      take: startDate || endDate ? undefined : 30,
    });
  }
}
