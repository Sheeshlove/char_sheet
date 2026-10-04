import { ABILITIES, type Ability } from '@ps/content-schema';
import { ABILITY_LABEL_RU, abilityMod } from '../tables/abilities';
import { proficiencyBonus } from '../tables/xp';
import type { Val, ValPart } from '../types';
import { makeVal, type AbilityState, type Pipeline } from './context';
import { labelOf } from './helpers';

/** Стадия 3: base + Σ add → предел (20 или ability_cap) → set_min. */
export function computeAbilities(p: Pipeline): AbilityState {
  const out = {} as AbilityState;
  const adds = p.active('ability');
  const caps = p.active('ability_cap');
  for (const a of ABILITIES) {
    const base = p.build.abilities.base[a];
    const parts: ValPart[] = [{ labelRu: 'Базовое значение', value: base }];
    for (const { effect, src } of adds) {
      if (effect.ability !== a || effect.op !== 'add') continue;
      parts.push({ labelRu: labelOf(src), sourceKey: src.sourceKey, value: p.num(effect.value, src) });
    }
    let score = parts.reduce((s, x) => s + x.value, 0);
    const cap = Math.max(20, ...caps.filter((c) => c.effect.ability === a).map((c) => c.effect.max));
    if (score > cap && base <= cap) {
      parts.push({ labelRu: `Предел ${cap}`, value: cap - score });
      score = cap;
    }
    for (const { effect, src } of adds) {
      if (effect.ability !== a || effect.op !== 'set_min') continue;
      const v = p.num(effect.value, src);
      if (v > score) {
        parts.push({ labelRu: labelOf(src), sourceKey: src.sourceKey, value: v - score });
        score = v;
      }
    }
    const scoreVal: Val = { value: score, parts: parts.filter((x, i) => i === 0 || x.value !== 0) };
    out[a] = { score, mod: abilityMod(score), scoreVal };
  }
  return out;
}

/** Стадия 4: бонус мастерства по общему уровню. */
export function computePb(p: Pipeline): Val {
  const lvl = Math.max(1, p.totalLevel);
  return makeVal([{ labelRu: `Уровень персонажа ${lvl}`, value: proficiencyBonus(lvl) }]);
}

export function modPart(p: Pipeline, a: Ability): ValPart {
  return { labelRu: `Модификатор: ${ABILITY_LABEL_RU[a]}`, value: p.abilities![a].mod };
}
