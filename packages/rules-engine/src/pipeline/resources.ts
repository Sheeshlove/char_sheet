import type { ComputedSheet } from '../types';
import type { Pipeline } from './context';
import { labelOf } from './helpers';

/** Стадия 12: ресурсы, переключатели, список умений. */
export function computeResources(p: Pipeline): Pick<ComputedSheet, 'resources' | 'toggles' | 'features'> {
  const resources = new Map<string, ComputedSheet['resources'][number]>();
  for (const { effect, src } of p.active('resource')) {
    const max = Math.max(0, Math.floor(p.num(effect.max, src)));
    const dieVal = p.dice(effect.die, src);
    const die = typeof dieVal === 'string' ? dieVal : typeof dieVal === 'number' && dieVal > 0 ? `d${dieVal}` : undefined;
    const prev = resources.get(effect.id);
    // RULES-NOTE: одинаковый ресурс из нескольких источников не суммируется — берётся максимум.
    if (prev && prev.max >= max) continue;
    resources.set(effect.id, {
      id: effect.id,
      nameRu: effect.nameRu,
      max,
      used: Math.min(max, p.state.resourcesUsed[effect.id] ?? 0),
      reset: effect.reset,
      die,
      sourceLabelRu: labelOf(src),
    });
  }

  const toggles: ComputedSheet['toggles'] = p.toggleDefs
    .filter((t) => p.check(t.effect.when, t.src))
    .map((t) => ({
      id: t.effect.id,
      labelRu: t.effect.labelRu,
      active: p.state.toggles.includes(t.effect.id),
      cost: t.effect.cost,
      exclusiveGroup: t.effect.exclusiveGroup,
      sourceLabelRu: labelOf(t.src),
    }));

  const features: ComputedSheet['features'] = [];
  for (const s of p.sources) {
    if (s.hiddenInList) continue;
    const list = s.features
      .filter((f) => !f.hidden)
      .map((f) => ({
        key: f.key,
        nameRu: f.nameRu,
        level: f.level,
        textMd: f.textMd || undefined,
        automated: f.effectsStatus,
        notes: f.effects.filter((e) => e.type === 'text' && e.noteRu).map((e) => (e as { noteRu: string }).noteRu),
      }));
    if (list.length) features.push({ sourceKey: s.sourceKey, sourceLabelRu: s.sourceLabelRu, features: list });
  }
  return { resources: [...resources.values()], toggles, features };
}
