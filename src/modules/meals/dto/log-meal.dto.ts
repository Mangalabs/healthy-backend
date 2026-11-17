import { IsIn, IsISO8601 } from 'class-validator';

export const MEAL_TYPES = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'] as const;
export type MealTypeValue = (typeof MEAL_TYPES)[number];

/** Só marca que a pessoa comeu: nada de calorias, porções ou alimentos. */
export class LogMealDto {
  @IsIn(MEAL_TYPES, { message: 'Refeição inválida.' })
  mealType: MealTypeValue;

  @IsISO8601(
    { strict: true },
    { message: 'A data deve estar no formato ISO-8601 válido.' },
  )
  loggedAt: string;
}
