/** Кости: разбор `NdM`, средние значения, масштабирование. */

export type Dice = { count: number; sides: number };

export function parseDice(s: string | number | undefined | null): Dice | null {
  if (s === undefined || s === null) return null;
  const str = String(s).trim().replace(/к/giu, 'd');
  const m = /^(\d*)d(\d+)$/i.exec(str);
  if (!m) return null;
  return { count: m[1] ? Number(m[1]) : 1, sides: Number(m[2]) };
}

export function formatDice(d: Dice): string {
  return `${d.count}d${d.sides}`;
}

export function diceAverage(d: Dice): number {
  return (d.count * (d.sides + 1)) / 2;
}

/** Большая из двух костей по среднему значению (строки `1d6`, `1d8`…). */
export function maxDice(a: string, b: string): string {
  const da = parseDice(a);
  const db = parseDice(b);
  if (!da) return b;
  if (!db) return a;
  return diceAverage(db) > diceAverage(da) ? b : a;
}

/** Масштабирование заговоров: ×1 до 4 ур., ×2 с 5, ×3 с 11, ×4 с 17 уровня персонажа. */
export function cantripMultiplier(characterLevel: number): number {
  if (characterLevel >= 17) return 4;
  if (characterLevel >= 11) return 3;
  if (characterLevel >= 5) return 2;
  return 1;
}

export function scaleDice(s: string, mult: number): string {
  const d = parseDice(s);
  if (!d) return s;
  return formatDice({ count: d.count * mult, sides: d.sides });
}

/** Отображение кубов по-русски: `1к6`. */
export function diceRu(s: string): string {
  return s.replace(/d/g, 'к');
}
