import type { ContentEntity, Effect, Feature, Predicate } from '@ps/content-schema';

export type EffectVisit = { entity: ContentEntity; feature?: Feature; effect: Effect; classKey?: string };

/** Все умения сущности (класс, подкласс, раса, черта, предыстория…). */
export function entityFeatures(e: ContentEntity): Feature[] {
  const d = e.data as { features?: Feature[]; feature?: Feature };
  return [...(d.features ?? []), ...(d.feature ? [d.feature] : [])];
}

function walkEffects(effects: Effect[], visit: (e: Effect) => void) {
  for (const e of effects) {
    visit(e);
    if (e.type === 'toggle') walkEffects(e.effects, visit);
    if (e.type === 'choice' && e.options.kind === 'list') for (const i of e.options.items) walkEffects(i.effects, visit);
  }
}

/** Обход всех эффектов контента с контекстом класса (для `col()`). */
export function forEachEffect(entities: ContentEntity[], cb: (v: EffectVisit) => void) {
  for (const entity of entities) {
    const classKey =
      entity.kind === 'class' ? entity.key : entity.kind === 'subclass' ? (entity.data as { classKey: string }).classKey : undefined;
    for (const feature of entityFeatures(entity)) walkEffects(feature.effects, (effect) => cb({ entity, feature, effect, classKey }));
    const d = entity.data as { effects?: Effect[]; selfEffects?: Effect[] };
    for (const list of [d.effects, d.selfEffects]) if (list) walkEffects(list, (effect) => cb({ entity, effect, classKey }));
  }
}

/** Все выражения эффекта (числа, условия). */
export function effectExprs(e: Effect): string[] {
  const out: string[] = [];
  const pred = (p: Predicate | undefined) => {
    if (p === undefined) return;
    if (typeof p === 'string') out.push(p);
    else if ('all' in p) p.all.forEach(pred);
    else if ('any' in p) p.any.forEach(pred);
    else if ('not' in p) pred(p.not);
  };
  pred(e.when);
  switch (e.type) {
    case 'ability':
    case 'bonus':
    case 'hp_max':
      out.push(e.value);
      break;
    case 'ac_formula':
      out.push(e.base);
      break;
    case 'speed':
      if (e.value) out.push(e.value);
      break;
    case 'resource':
      out.push(e.max);
      if (e.die && !/^\d*[dк]\d+$/i.test(e.die)) out.push(e.die);
      break;
    case 'choice':
      if (typeof e.choose === 'string') out.push(e.choose);
      break;
    case 'spell_grant':
      if (e.uses) out.push(e.uses.count);
      break;
    case 'weapon_option':
      if (e.minDamageDie && !/^\d*[dк]\d+$/i.test(e.minDamageDie)) out.push(e.minDamageDie);
      break;
    case 'unarmed_damage':
      if (!/^\d*[dк]\d+$/i.test(e.dice)) out.push(e.dice);
      break;
    case 'attack':
      for (const d of e.damage) if (!/^\d*[dк]\d+$/i.test(d.dice)) out.push(d.dice);
      break;
  }
  return out;
}

/** Ключи контента, на которые ссылается эффект. */
export function effectRefs(e: Effect): string[] {
  switch (e.type) {
    case 'spell_grant':
      return typeof e.spell === 'string' ? [e.spell] : [];
    case 'spell_list_extend':
      return e.spells;
    case 'choice':
      return e.options.kind === 'fighting_style' ? e.options.styles : [];
    default:
      return [];
  }
}
