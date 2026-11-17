import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { CoinsService } from './coins.service';
import { DailyGoalService } from './daily-goal.service';
import { CreateGoalDto } from './dto/create-goal.dto';
import { GoalsService } from './goals.service';

@UseGuards(JwtAuthGuard)
@Controller('goals')
export class GoalsController {
  constructor(
    private readonly goals: GoalsService,
    private readonly daily: DailyGoalService,
  ) {}

  /** Meta do dia: tarefas dos módulos ativos, progresso, sequência e descanso. */
  @Get('today')
  today(@CurrentUser() user: AuthenticatedUser) {
    return this.daily.today(user.profileId);
  }

  @Post('rest-day')
  restDay(@CurrentUser() user: AuthenticatedUser) {
    return this.daily.setRestDay(user.profileId);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.goals.list(user.profileId);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateGoalDto) {
    return this.goals.create(user.profileId, dto);
  }

  @Delete(':id')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.goals.cancel(user.profileId, id);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('coins')
export class CoinsController {
  constructor(private readonly coins: CoinsService) {}

  @Get()
  async balance(@CurrentUser() user: AuthenticatedUser) {
    return {
      coins: await this.coins.balance(user.profileId),
      history: await this.coins.history(user.profileId),
    };
  }
}
