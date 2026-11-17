import { Module } from '@nestjs/common';
import { GamificationService } from './gamification.service';
import { GamificationController } from './gamification.controller';
import { StreakService } from './streak.service';
import { CoinsService } from './coins.service';
import { DailyGoalService } from './daily-goal.service';
import { GoalsService } from './goals.service';
import { CoinsController, GoalsController } from './goals.controller';

@Module({
  controllers: [GamificationController, GoalsController, CoinsController],
  providers: [
    GamificationService,
    StreakService,
    CoinsService,
    DailyGoalService,
    GoalsService,
  ],
  exports: [StreakService, CoinsService],
})
export class GamificationModule {}
