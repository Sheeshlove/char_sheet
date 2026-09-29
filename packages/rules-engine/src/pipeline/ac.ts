import type { ComputedSheet, ValPart } from '../types';
import { makeVal, type Pipeline } from './context';
import { bonusParts, labelOf } from './helpers';

type Candidate = { labelRu: string; parts: ValPart[]; allowShield: boolean };

/** Стадия 7: КД — максимум из допустимых формул + щит + бонусы (SPEC §8.6). */
export function computeAc(p: Pipeline): ComputedSheet['ac'] {
  const eq = p.equipment;
  const dex = p.abilities!.dex.mod;
  if (eq.body.length > 1) p.issues.push({ severity: 'error', code: 'multiple_armor', messageRu: 'Надето больше одного доспеха.' });
  if (eq.shields.length > 1) p.issues.push({ severity: 'error', code: 'multiple_shields', messageRu: 'Надето больше одного щита.' });

  const candidates: Candidate[] = [];
  const body = eq.body[0];
  if (!body) {
    candidates.push({
      labelRu: 'Без доспехов',
      parts: [
        { labelRu: 'Без доспехов', value: 10 },
        { labelRu: 'Ловкость', value: dex },
      ],
      allowShield: true,
    });
  } else {
    const d = body.data;
    const parts: ValPart[] = [{ labelRu: body.nameRu, value: d.baseAc }];
    if (d.category === 'light') parts.push({ labelRu: 'Ловкость', value: dex });
    else if (d.category === 'medium') {
      const ruleCaps = p
        .active('armor_rule')
        .filter((r) => r.effect.category === 'medium' && r.effect.dexCap !== undefined)
        .map((r) => r.effect.dexCap!);
      const cap = ruleCaps.length ? Math.max(...ruleCaps) : (d.dexCap ?? 2);
      parts.push({ labelRu: `Ловкость (не более ${cap})`, value: Math.min(dex, cap) });
    }
    if (body.magicBonus) parts.push({ labelRu: 'Магический бонус доспеха', value: body.magicBonus });
    candidates.push({ labelRu: body.nameRu, parts, allowShield: true });
  }

  for (const { effect, src } of p.active('ac_formula')) {
    const ok =
      effect.requires === 'any' ||
      (effect.requires === 'no_armor' && !body) ||
      (effect.requires === 'no_armor_no_shield' && !body && !eq.hasShield);
    if (!ok) continue;
    candidates.push({
      labelRu: effect.labelRu,
      parts: [{ labelRu: effect.labelRu || labelOf(src), sourceKey: src.sourceKey, value: p.num(effect.base, src) }],
      allowShield: effect.allowShield,
    });
  }

  const total = (c: Candidate) => c.parts.reduce((s, x) => s + x.value, 0);
  let best = candidates[0]!;
  for (const c of candidates) if (total(c) > total(best)) best = c;

  const parts = [...best.parts];
  const shield = eq.shields[0];
  if (shield && best.allowShield) {
    parts.push({ labelRu: shield.nameRu, value: shield.data.baseAc });
    if (shield.magicBonus) parts.push({ labelRu: 'Магический бонус щита', value: shield.magicBonus });
  }
  parts.push(...bonusParts(p, ['ac']));
  const val = makeVal(parts);
  return { ...val, formulaLabelRu: best.labelRu };
}
