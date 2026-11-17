import {
  bmi,
  buildCheckpoints,
  directionFor,
  floorWeightKg,
  hasReached,
  rewardTargetFor,
} from './body.util';

describe('body.util', () => {
  it('calcula o piso de saúde pelo IMC e pela altura', () => {
    expect(floorWeightKg(170, 18.5)).toBe(53.47);
    expect(floorWeightKg(160, 18.5)).toBe(47.36);
  });

  it('calcula o IMC', () => {
    expect(bmi(70, 175)).toBe(22.86);
  });

  it('descobre a direção pela diferença entre início e alvo', () => {
    expect(directionFor(80, 70)).toBe('LOSE');
    expect(directionFor(45, 52)).toBe('GAIN');
    expect(directionFor(60, 60.2)).toBe('MAINTAIN');
  });

  it('o alvo de recompensa ao perder peso não desce do piso', () => {
    expect(rewardTargetFor('LOSE', 45, 53.47)).toBe(53.47);
    expect(rewardTargetFor('LOSE', 60, 53.47)).toBe(60);
    expect(rewardTargetFor('LOSE', 45, null)).toBe(45);
    // ao ganhar, o piso não interfere
    expect(rewardTargetFor('GAIN', 55, 53.47)).toBe(55);
  });

  it('gera degraus de 2 kg sem incluir início nem alvo', () => {
    expect(buildCheckpoints(80, 70, 'LOSE')).toEqual([78, 76, 74, 72]);
    expect(buildCheckpoints(45, 51, 'GAIN')).toEqual([47, 49]);
  });

  it('não gera degraus quando o caminho é curto ou é manutenção', () => {
    expect(buildCheckpoints(70, 69, 'LOSE')).toEqual([]);
    expect(buildCheckpoints(70, 70, 'MAINTAIN')).toEqual([]);
  });

  it('aumenta o passo para não passar de 9 degraus', () => {
    const values = buildCheckpoints(150, 60, 'LOSE');
    expect(values.length).toBeLessThanOrEqual(9);
    expect(values[0]).toBeLessThan(150);
    expect(values[values.length - 1]).toBeGreaterThan(60);
  });

  it('detecta o alcance na direção certa', () => {
    expect(hasReached('LOSE', 71.9, 72)).toBe(true);
    expect(hasReached('LOSE', 72.1, 72)).toBe(false);
    expect(hasReached('GAIN', 49, 49)).toBe(true);
    expect(hasReached('GAIN', 48.9, 49)).toBe(false);
    expect(hasReached('MAINTAIN', 70, 70)).toBe(false);
  });
});
