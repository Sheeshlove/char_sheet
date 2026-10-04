/** Опыт для уровня (SPEC §8.12). Индекс = уровень − 1. */
export const XP_FOR_LEVEL = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000,
  265000, 305000, 355000,
] as const;

/** Порог опыта для следующего уровня или null на 20-м. */
export function nextLevelXp(level: number): number | null {
  if (level >= 20) return null;
  return XP_FOR_LEVEL[Math.max(0, level)] ?? null;
}

/** Уровень, соответствующий количеству опыта. */
export function levelForXp(xp: number): number {
  let lvl = 1;
  for (let i = 0; i < XP_FOR_LEVEL.length; i++) if (xp >= XP_FOR_LEVEL[i]!) lvl = i + 1;
  return lvl;
}

export function proficiencyBonus(level: number): number {
  return 2 + Math.floor((Math.max(1, level) - 1) / 4);
}
