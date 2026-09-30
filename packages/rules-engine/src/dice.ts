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

// ─── Броски (SPEC §4.7) ──────────────────────────────────────────────────

export type RollMode = 'normal' | 'advantage' | 'disadvantage';

export type RollTerm =
  | { kind: 'dice'; sign: 1 | -1; count: number; sides: number; keep?: { high: boolean; n: number }; rolls: number[]; kept: boolean[] }
  | { kind: 'mod'; sign: 1 | -1; value: number };

export type RollResult = {
  expression: string;
  mode: RollMode;
  total: number;
  terms: RollTerm[];
  /** Выпавшее значение к20, если в выражении ровно одна к20 (для отметки «натуральной 20/1»). */
  natural?: number;
};

const MAX_TERMS = 20;
const MAX_DICE = 100;

/**
 * Бросок выражения вида `1d20+5`, `2d6+1d4-1`, `4d6kh3` (оставить 3 лучших) с источником
 * случайности `rng` ∈ [0, 1). Преимущество/помеха относятся к первой одиночной к20: бросаются
 * две, берётся большая/меньшая. Некорректное выражение → null.
 */
export function rollExpression(expression: string, mode: RollMode, rng: () => number): RollResult | null {
  const src = expression.replace(/\s+/g, '').replace(/к/giu, 'd').toLowerCase();
  if (!src || src.length > 100 || !/^[+-]?[0-9d+khl-]+$/.test(src)) return null;
  const parts = src.match(/[+-]?[^+-]+/g);
  if (!parts || parts.length > MAX_TERMS) return null;
  const terms: RollTerm[] = [];
  let diceCount = 0;
  let advApplied = mode === 'normal';
  for (const raw of parts) {
    const sign: 1 | -1 = raw.startsWith('-') ? -1 : 1;
    const body = raw.replace(/^[+-]/, '');
    const dm = /^(\d*)d(\d+)(?:k([hl])(\d+))?$/.exec(body);
    if (dm) {
      let count = Number(dm[1] || 1);
      const sides = Number(dm[2]);
      if (count < 1 || sides < 2 || sides > 1000) return null;
      let keep = dm[3] ? { high: dm[3] === 'h', n: Number(dm[4]) } : undefined;
      if (!advApplied && count === 1 && sides === 20 && !keep && sign === 1) {
        count = 2;
        keep = { high: mode === 'advantage', n: 1 };
        advApplied = true;
      }
      if (keep && (keep.n < 1 || keep.n > count)) return null;
      diceCount += count;
      if (diceCount > MAX_DICE) return null;
      const rolls = Array.from({ length: count }, () => 1 + Math.floor(rng() * sides));
      let kept = rolls.map(() => true);
      if (keep) {
        const order = rolls.map((v, i) => ({ v, i })).sort((a, b) => (keep!.high ? b.v - a.v : a.v - b.v) || a.i - b.i);
        const keepIdx = new Set(order.slice(0, keep.n).map((o) => o.i));
        kept = rolls.map((_, i) => keepIdx.has(i));
      }
      terms.push({ kind: 'dice', sign, count, sides, ...(keep ? { keep } : {}), rolls, kept });
      continue;
    }
    if (/^\d+$/.test(body) && Number(body) <= 10000) {
      terms.push({ kind: 'mod', sign, value: Number(body) });
      continue;
    }
    return null;
  }
  if (!terms.some((t) => t.kind === 'dice')) return null;
  const total = terms.reduce(
    (sum, t) => sum + t.sign * (t.kind === 'mod' ? t.value : t.rolls.reduce((a, v, i) => a + (t.kept[i] ? v : 0), 0)),
    0,
  );
  const d20 = terms.filter((t): t is Extract<RollTerm, { kind: 'dice' }> => t.kind === 'dice' && t.sides === 20);
  const single = d20.length === 1 && d20[0]!.kept.filter(Boolean).length === 1 ? d20[0]! : null;
  return {
    expression: src,
    mode,
    total,
    terms,
    ...(single ? { natural: single.rolls[single.kept.indexOf(true)] } : {}),
  };
}

/**
 * Бросок формулы вида `5d4*10`, `2d6+3`, `4d6` с источником случайности `rng` ∈ [0, 1).
 * Возвращает итог и отдельные кости. Пустая или некорректная формула → null.
 */
export function rollFormula(formula: string, rng: () => number): { total: number; dice: number[] } | null {
  const m = /^\s*(\d*)\s*[dк]\s*(\d+)\s*(?:([*+-])\s*(\d+))?\s*$/iu.exec(formula);
  if (!m) return null;
  const count = Number(m[1] || 1);
  const sides = Number(m[2]);
  if (count < 1 || count > 100 || sides < 1 || sides > 1000) return null;
  const dice = Array.from({ length: count }, () => 1 + Math.floor(rng() * sides));
  let total = dice.reduce((a, b) => a + b, 0);
  const k = Number(m[4] ?? 0);
  if (m[3] === '*') total *= k;
  else if (m[3] === '+') total += k;
  else if (m[3] === '-') total -= k;
  return { total, dice };
}
