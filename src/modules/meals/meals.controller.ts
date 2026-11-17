import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsDateString, IsOptional } from 'class-validator';
import { MealLog } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { MealsService } from './meals.service';
import { LogMealDto } from './dto/log-meal.dto';

class MealsHistoryQuery {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('meals')
export class MealsController {
  constructor(private readonly meals: MealsService) {}

  @Post()
  log(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: LogMealDto,
  ): Promise<MealLog> {
    return this.meals.log(user.profileId, dto);
  }

  @Get('daily')
  daily(
    @CurrentUser() user: AuthenticatedUser,
    @Query('date') date?: string,
  ): Promise<MealLog[]> {
    return this.meals.getDaily(user.profileId, date);
  }

  @Get('history')
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MealsHistoryQuery,
  ): Promise<MealLog[]> {
    return this.meals.getHistory(user.profileId, query.startDate, query.endDate);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.meals.remove(user.profileId, id);
  }
}
