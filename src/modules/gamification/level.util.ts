/** XP necessário para sair do nível `level` e chegar ao próximo. */
export function xpForNextLevel(level: number): number {
  return level * 100;
}

export interface LevelProgress {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progressPercentage: number;
}

/** Converte o XP total acumulado em nível e progresso dentro do nível. */
export function levelFromTotalXp(totalXp: number): LevelProgress {
  let level = 1;
  let remaining = Math.max(0, totalXp);

  while (remaining >= xpForNextLevel(level)) {
    remaining -= xpForNextLevel(level);
    level += 1;
  }

  const needed = xpForNextLevel(level);
  return {
    level,
    xpIntoLevel: remaining,
    xpForNextLevel: needed,
    progressPercentage: Math.round((remaining / needed) * 100),
  };
}
