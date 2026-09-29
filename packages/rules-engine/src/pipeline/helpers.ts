import type { AttackEvalCtx, Pipeline, SourceCtx } from './context';
import type { RollModeInfo, ValPart } from '../types';

export function labelOf(src: SourceCtx): string {
  return src.featureNameRu && src.featureNameRu !== src.sourceLabelRu
    ? `${src.sourceLabelRu}: ${src.featureNameRu}`
    : src.sourceLabelRu;
}

/**
 * Части Val от эффектов `bonus` с целями из `targets` (SPEC §6.3):
 * бонусы одного `bonusType` не складываются — берётся максимальный.
 */
export function bonusParts(p: Pipeline, targets: readonly string[], attack?: AttackEvalCtx): ValPart[] {
  const plain: ValPart[] = [];
  const typed = new Map<string, ValPart>();
  for (const { effect, src } of p.ofType('bonus')) {
    if (!targets.includes(effect.target)) continue;
    if (!p.check(effect.when, src, attack)) continue;
    const value = p.num(effect.value, src, attack);
    const part: ValPart = { labelRu: effect.labelRu ?? labelOf(src), sourceKey: src.sourceKey, value };
    if (effect.bonusType) {
      const prev = typed.get(effect.bonusType);
      if (!prev || value > prev.value) typed.set(effect.bonusType, part);
    } else plain.push(part);
  }
  return [...plain, ...typed.values()].filter((x) => x.value !== 0);
}

export function modesFor(p: Pipeline, targets: readonly string[]): RollModeInfo[] {
  const out: RollModeInfo[] = [];
  for (const { effect, src } of p.ofType('roll_mode')) {
    if (!targets.includes(effect.target)) continue;
    if (!p.check(effect.when, src)) continue;
    out.push({
      mode: effect.mode,
      target: effect.target,
      noteRu: effect.noteRu,
      conditional: effect.conditional ?? true,
      sourceKey: src.sourceKey,
      sourceLabelRu: labelOf(src),
    });
  }
  return out;
}

/** Итог безусловных режимов: +1 преимущество, −1 помеха, 0 — нет или взаимно гасятся. */
export function netUnconditional(modes: RollModeInfo[]): -1 | 0 | 1 {
  const adv = modes.some((m) => !m.conditional && m.mode === 'advantage');
  const dis = modes.some((m) => !m.conditional && m.mode === 'disadvantage');
  if (adv && !dis) return 1;
  if (dis && !adv) return -1;
  return 0;
}
