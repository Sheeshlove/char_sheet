import type { ComputedSheet, ValPart } from '../types';
import { makeVal, type Pipeline } from './context';
import { bonusParts, labelOf } from './helpers';

export function hitDieOf(p: Pipeline, classKey: string): 6 | 8 | 10 | 12 {
  return p.classData(classKey)?.hitDie ?? 8;
}

/** Хиты за уровень до модификатора Телосложения. */
export function levelHpPart(die: number, index: number, hp: { method: string; roll?: number }): number {
  if (index === 0) return die;
  if (hp.method === 'max') return die;
  if (hp.method === 'roll' && hp.roll !== undefined) return Math.max(1, Math.min(die, hp.roll));
  return die / 2 + 1;
}

/** Стадия 9: хиты и кости хитов (SPEC §8.7). */
export function computeHp(p: Pipeline): { hp: ComputedSheet['hp']; hitDice: ComputedSheet['hitDice'] } {
  const con = p.abilities!.con.mod;
  let dice = 0;
  let total = 0;
  p.build.levels.forEach((lvl, i) => {
    const die = hitDieOf(p, lvl.classKey);
    const part = levelHpPart(die, i, lvl.hp);
    if (i > 0 && lvl.hp.method === 'max') {
      p.issues.push({
        severity: 'warning',
        code: 'hp_max_not_first',
        messageRu: `Уровень ${i + 1}: максимум кости хитов допускается только с разрешения мастера.`,
      });
    }
    dice += part;
    // RULES-NOTE: хиты за уровень не меньше 1 даже при отрицательном Телосложении (docs/rules-decisions.md).
    total += Math.max(1, part + con);
  });
  const n = p.build.levels.length;
  const parts: ValPart[] = [{ labelRu: 'Кости хитов', value: dice }];
  if (n) parts.push({ labelRu: `Телосложение × ${n}`, value: total - dice });
  for (const { effect, src } of p.active('hp_max')) {
    parts.push({ labelRu: labelOf(src), sourceKey: src.sourceKey, value: p.num(effect.value, src) });
  }
  parts.push(...bonusParts(p, ['hp_max']));
  let max = parts.reduce((s, x) => s + x.value, 0);
  if (p.state.exhaustion >= 4) {
    const half = Math.floor(max / 2);
    parts.push({ labelRu: 'Истощение 4: максимум вдвое', value: half - max });
    max = half;
  }
  if (max < 1 && n > 0) {
    parts.push({ labelRu: 'Минимум 1', value: 1 - max });
  }
  const val = makeVal(parts);
  const current = Math.max(0, Math.min(p.state.hp.current, val.value));

  const byDie = new Map<6 | 8 | 10 | 12, number>();
  for (const [classKey, lvl] of p.classLevels) {
    if (lvl <= 0) continue;
    const d = hitDieOf(p, classKey);
    byDie.set(d, (byDie.get(d) ?? 0) + lvl);
  }
  const hitDice = [...byDie.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([die, totalDice]) => ({
      die,
      total: totalDice,
      used: Math.min(totalDice, p.state.hitDiceUsed[`d${die}` as 'd6'] ?? 0),
    }));
  return { hp: { max: val, current, temp: p.state.hp.temp }, hitDice };
}
