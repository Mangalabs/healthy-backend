import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export const GOAL_TYPES = ['WEIGHT', 'WEEKLY_WORKOUTS'] as const;
export type GoalTypeValue = (typeof GOAL_TYPES)[number];

export class CreateGoalDto {
  @IsIn(GOAL_TYPES, { message: 'Tipo de meta inválido.' })
  type: GoalTypeValue;

  /** Peso alvo em kg (WEIGHT) ou treinos por semana (WEEKLY_WORKOUTS). */
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Valor da meta inválido.' })
  @Min(1, { message: 'O valor da meta deve ser maior que zero.' })
  @Max(400, { message: 'O valor da meta é alto demais.' })
  targetValue: number;

  /** Peso de partida; sem ele usa o último peso registrado. */
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Peso inicial inválido.' })
  @Min(25, { message: 'O peso inicial mínimo é 25 kg.' })
  @Max(400, { message: 'O peso inicial máximo é 400 kg.' })
  @IsOptional()
  startValue?: number;

  /** Aceita um alvo abaixo do piso de saúde (a recompensa para no piso). */
  @IsBoolean()
  @IsOptional()
  confirmBelowFloor?: boolean;
}
