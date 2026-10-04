import type { Ability } from '@ps/content-schema';

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;
export const POINT_BUY_BUDGET = 27;
export const POINT_BUY_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };

export function pointBuyCost(scores: Record<Ability, number>): number | null {
  let total = 0;
  for (const v of Object.values(scores)) {
    const c = POINT_BUY_COST[v];
    if (c === undefined) return null;
    total += c;
  }
  return total;
}

/** Сумма 4к6 без наименьшего. */
export function rollTotal(dice: number[]): number {
  if (dice.length < 4) return dice.reduce((a, b) => a + b, 0);
  const sorted = [...dice].sort((a, b) => a - b);
  return sorted.slice(1).reduce((a, b) => a + b, 0);
}

export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

export const ABILITY_LABEL_RU: Record<Ability, string> = {
  str: 'Сила',
  dex: 'Ловкость',
  con: 'Телосложение',
  int: 'Интеллект',
  wis: 'Мудрость',
  cha: 'Харизма',
};

export const ABILITY_SHORT_RU: Record<Ability, string> = {
  str: 'Сил',
  dex: 'Лов',
  con: 'Тел',
  int: 'Инт',
  wis: 'Мдр',
  cha: 'Хар',
};
