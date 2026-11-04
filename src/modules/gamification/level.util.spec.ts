import { levelFromTotalXp } from './level.util';

describe('levelFromTotalXp', () => {
  it('começa no nível 1', () => {
    expect(levelFromTotalXp(0)).toMatchObject({ level: 1, xpIntoLevel: 0 });
  });

  it('sobe de nível com 100 XP e o próximo custa 200', () => {
    expect(levelFromTotalXp(100)).toMatchObject({
      level: 2,
      xpIntoLevel: 0,
      xpForNextLevel: 200,
    });
  });

  it('mantém o resto dentro do nível', () => {
    expect(levelFromTotalXp(350)).toMatchObject({
      level: 3,
      xpIntoLevel: 50,
      xpForNextLevel: 300,
      progressPercentage: 17,
    });
  });
});
