import type { Size, SpeedMode } from '@ps/content-schema';
import { CARRY_MULTIPLIER, shiftSize } from '../tables/sizes';
import type { ComputedSheet, Val, ValPart } from '../types';
import { makeVal, type Pipeline, type SourceCtx } from './context';
import { bonusParts, labelOf } from './helpers';

const MODES: SpeedMode[] = ['walk', 'fly', 'swim', 'climb', 'burrow'];

export function computeSize(p: Pipeline): Size {
  const race = p.content.getOf(p.build.race, 'race');
  let size: Size = race?.data.size ?? 'medium';
  for (const { effect } of p.active('size')) size = effect.size;
  return size;
}

/** Вес снаряжения и монет, грузоподъёмность (SPEC §8.6). */
export function computeCarrying(p: Pipeline, size: Size): ComputedSheet['carrying'] {
  let weight = 0;
  for (const item of p.state.inventory) {
    const ent = p.content.get(item.key);
    let w = item.customWeightLb;
    if (w === undefined && ent) {
      const d = ent.data as { weightLb?: number; baseItem?: unknown };
      w = d.weightLb;
      if (w === undefined && ent.kind === 'item') {
        const baseKey = typeof ent.data.baseItem === 'string' ? ent.data.baseItem : item.baseKey;
        const base = p.content.get(baseKey);
        w = (base?.data as { weightLb?: number } | undefined)?.weightLb;
      }
    }
    weight += (w ?? 0) * item.qty;
  }
  const c = p.state.currency;
  weight += (c.cp + c.sp + c.ep + c.gp + c.pp) / 50;
  weight = Math.round(weight * 100) / 100;

  const steps = p.active('carry').reduce((s, x) => s + x.effect.sizeSteps, 0);
  const str = p.abilities!.str.score;
  const extra = bonusParts(p, ['carry_capacity']).reduce((s, x) => s + x.value, 0);
  const capacity = str * 15 * CARRY_MULTIPLIER[shiftSize(size, steps)] + extra;
  let status: ComputedSheet['carrying']['status'] = 'ok';
  const mode = p.rules.encumbrance;
  if (mode === 'basic') {
    if (weight > capacity) status = 'over_capacity';
  } else if (mode === 'variant') {
    if (weight > capacity) status = 'over_capacity';
    else if (weight > str * 10) status = 'heavily_encumbered';
    else if (weight > str * 5) status = 'encumbered';
  }
  if (mode === 'variant' && (status === 'heavily_encumbered' || status === 'over_capacity')) {
    const src: SourceCtx = { sourceKey: 'system/encumbrance', sourceLabelRu: 'Сильная нагрузка', featureKey: 'encumbrance' };
    const note = 'Сильная нагрузка';
    for (const target of ['check:str', 'check:dex', 'check:con', 'save:str', 'save:dex', 'save:con'] as const) {
      p.pushEffect({ type: 'roll_mode', mode: 'disadvantage', target, noteRu: note, conditional: false }, src);
    }
    p.pushEffect({ type: 'roll_mode', mode: 'disadvantage', target: 'attack:*', noteRu: `${note} (атаки)`, conditional: false }, src);
  }
  return { weightLb: weight, capacityLb: capacity, pushDragLiftLb: capacity * 2, status };
}

/** Стадия 8: скорость — set (макс.) → add → equal_walk → штрафы (SPEC §8.6). */
export function computeSpeed(p: Pipeline, carrying: ComputedSheet['carrying']): ComputedSheet['speed'] {
  const race = p.content.getOf(p.build.race, 'race');
  const sets = new Map<SpeedMode, ValPart>();
  const adds = new Map<SpeedMode, ValPart[]>();
  const equalWalk = new Set<SpeedMode>();
  const zero = new Set<SpeedMode>();
  if (race) {
    for (const m of MODES) {
      const v = race.data.speed[m];
      if (v !== undefined && v > 0) sets.set(m, { labelRu: race.nameRu, sourceKey: race.key, value: v });
    }
  }
  if (!sets.has('walk')) sets.set('walk', { labelRu: 'Базовая скорость', value: race ? race.data.speed.walk : 30 });

  for (const { effect, src } of p.active('speed')) {
    const modes = effect.mode === 'all' ? MODES : [effect.mode];
    for (const m of modes) {
      if (effect.op === 'zero') zero.add(m);
      else if (effect.op === 'equal_walk') equalWalk.add(m);
      else if (effect.op === 'set') {
        const v = p.num(effect.value, src);
        const prev = sets.get(m);
        if (!prev || v > prev.value) sets.set(m, { labelRu: labelOf(src), sourceKey: src.sourceKey, value: v });
      } else if (effect.op === 'add' && effect.mode !== 'all') {
        const list = adds.get(m) ?? [];
        list.push({ labelRu: labelOf(src), sourceKey: src.sourceKey, value: p.num(effect.value, src) });
        adds.set(m, list);
      } else if (effect.op === 'add') {
        // 'all' + add: только к уже имеющимся видам
        const list = adds.get(m) ?? [];
        list.push({ labelRu: labelOf(src), sourceKey: src.sourceKey, value: p.num(effect.value, src) });
        adds.set(m, list);
      }
    }
  }
  for (const m of MODES) {
    const b = bonusParts(p, [`speed:${m}`]);
    if (b.length) adds.set(m, [...(adds.get(m) ?? []), ...b]);
  }

  const partsByMode = new Map<SpeedMode, ValPart[]>();
  for (const m of MODES) {
    const set = sets.get(m);
    if (!set && !equalWalk.has(m)) continue;
    const parts: ValPart[] = set ? [set] : [];
    if (set) parts.push(...(adds.get(m) ?? []));
    partsByMode.set(m, parts);
  }
  const walkBase = (partsByMode.get('walk') ?? []).reduce((s, x) => s + x.value, 0);
  for (const m of equalWalk) {
    if (m === 'walk') continue;
    const cur = (partsByMode.get(m) ?? []).reduce((s, x) => s + x.value, 0);
    if (walkBase > cur) partsByMode.set(m, [{ labelRu: 'Равна скорости ходьбы', value: walkBase }]);
  }

  // Штрафы
  // RULES-NOTE: −10 фт тяжёлого доспеха — ко всем видам скорости; пороги нагрузки Сил×5/×10 без множителя размера.
  const body = p.equipment.body[0];
  const ignoreStr = p.active('armor_rule').some((r) => r.effect.category === 'heavy' && r.effect.ignoreStrSpeedPenalty);
  const heavyPenalty =
    body?.data.category === 'heavy' &&
    body.data.strRequirement !== undefined &&
    p.abilities!.str.score < body.data.strRequirement &&
    !ignoreStr;
  const encPenalty =
    p.rules.encumbrance === 'variant'
      ? carrying.status === 'encumbered'
        ? -10
        : carrying.status === 'heavily_encumbered' || carrying.status === 'over_capacity'
          ? -20
          : 0
      : 0;
  const ex = p.state.exhaustion;

  const out: ComputedSheet['speed'] = {};
  for (const [m, parts] of partsByMode) {
    const ps = [...parts];
    if (heavyPenalty) ps.push({ labelRu: `Тяжёлый доспех: Сила ниже ${body!.data.strRequirement}`, value: -10 });
    if (encPenalty) ps.push({ labelRu: 'Нагрузка', value: encPenalty });
    let v = Math.max(0, ps.reduce((s, x) => s + x.value, 0));
    if (ex >= 5 || zero.has(m)) {
      if (v) ps.push({ labelRu: ex >= 5 ? 'Истощение 5' : 'Скорость 0', value: -v });
      v = 0;
    } else if (ex >= 2) {
      const half = Math.floor(v / 2);
      ps.push({ labelRu: 'Истощение 2: скорость вдвое', value: half - v });
      v = half;
    }
    const val: Val = makeVal(ps);
    if (val.value < 0) val.value = 0;
    out[m] = val;
  }
  return out;
}

export function computeSenses(p: Pipeline): { sense: string; rangeFt: number }[] {
  const base = new Map<string, number>();
  const add = new Map<string, number>();
  for (const { effect } of p.active('sense')) {
    if (effect.op === 'set_max') base.set(effect.sense, Math.max(base.get(effect.sense) ?? 0, effect.rangeFt));
    else add.set(effect.sense, (add.get(effect.sense) ?? 0) + effect.rangeFt);
  }
  const keys = new Set([...base.keys(), ...add.keys()]);
  return [...keys].sort().map((s) => ({ sense: s, rangeFt: (base.get(s) ?? 0) + (add.get(s) ?? 0) }));
}
