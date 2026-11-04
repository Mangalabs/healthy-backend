import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { TimezoneService } from '../../common/timezone/timezone.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timezoneService: TimezoneService,
  ) {}

  async getHomeSummary(profileId: string) {
    const { start, end } = await this.timezoneService.dayRange(profileId);
    const today = { gte: start, lt: end };

    const [hydration, exercise, profile] = await Promise.all([
      this.prisma.hydrationLog.aggregate({
        _sum: { amountMl: true },
        where: { profileId, loggedAt: today },
      }),
      this.prisma.exerciseLog.findFirst({
        where: { profileId, loggedAt: today },
      }),
      this.prisma.profile.findUnique({
        where: { id: profileId },
        select: {
          currentXp: true,
          streakDays: true,
          name: true,
          dailyHydrationGoal: true,
        },
      }),
    ]);

    return {
      hydration: { current: hydration._sum.amountMl || 0 },
      exercise: { done: exercise?.didExercise ?? null },
      profile,
    };
  }
}
