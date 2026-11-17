export type WeightDirection = 'LOSE' | 'GAIN' | 'MAINTAIN';

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Menor diferença (kg) que conta como "mudar de peso"; abaixo disso é manter. */
export const MAINTAIN_TOLERANCE_KG = 0.5;

/** Peso mínimo saudável para a altura, a partir do IMC de piso. */
export function floorWeightKg(heightCm: number, floorBmi: number): number {
  const meters = heightCm / 100;
  return round2(floorBmi * meters * meters);
}

export function bmi(weightKg: number, heightCm: number): number {
  const meters = heightCm / 100;
  return round2(weightKg / (meters * meters));
}

export function directionFor(
  startKg: number,
  targetKg: number,
): WeightDirection {
  const diff = targetKg - startKg;
  if (Math.abs(diff) < MAINTAIN_TOLERANCE_KG) return 'MAINTAIN';
  return diff < 0 ? 'LOSE' : 'GAIN';
}

/**
 * Alvo que dá recompensa. Ao perder peso, o alvo nunca desce abaixo do piso
 * de saúde: ir além disso não rende nada.
 */
export function rewardTargetFor(
  direction: WeightDirection,
  targetKg: number,
  floorKg: number | null,
): number {
  if (direction === 'LOSE' && floorKg !== null) {
    return round2(Math.max(targetKg, floorKg));
  }
  return round2(targetKg);
}

/**
 * Degraus intermediários entre o peso inicial e o alvo, sem incluir os dois
 * extremos. Passo de 2 kg, aumentado para não passar de 9 degraus.
 */
export function buildCheckpoints(
  startKg: number,
  rewardTargetKg: number,
  direction: WeightDirection,
  stepKg = 2,
): number[] {
  if (direction === 'MAINTAIN') return [];
  const distance = Math.abs(rewardTargetKg - startKg);
  let step = stepKg;
  while (distance / step > 9) step += 1;
  const sign = direction === 'LOSE' ? -1 : 1;
  const values: number[] = [];
  for (let value = startKg + sign * step; ; value += sign * step) {
    const reachedEnd =
      direction === 'LOSE'
        ? value <= rewardTargetKg + 0.25
        : value >= rewardTargetKg - 0.25;
    if (reachedEnd) break;
    values.push(round2(value));
  }
  return values;
}

/** O peso atingiu (ou passou) o valor, na direção da meta. */
export function hasReached(
  direction: WeightDirection,
  weightKg: number,
  valueKg: number,
): boolean {
  if (direction === 'LOSE') return weightKg <= valueKg;
  if (direction === 'GAIN') return weightKg >= valueKg;
  return false;
}
