import type { ComputedSheet, Val } from '../types';
import type { Pipeline } from './context';

function isVal(x: unknown): x is Val {
  return !!x && typeof x === 'object' && 'value' in x && 'parts' in x && typeof (x as Val).value === 'number';
}

/** Разрешение пути вида `skills.stealth` или `abilities.dex.save` к Val в листе. */
export function resolveValPath(sheet: ComputedSheet, path: string): Val | undefined {
  const alias: Record<string, string> = { 'hp.max': 'hp.max', hp: 'hp.max' };
  const parts = (alias[path] ?? path).split('.');
  let cur: unknown = sheet;
  for (const seg of parts) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  if (isVal(cur)) return cur;
  if (cur && typeof cur === 'object' && isVal((cur as { value?: unknown }).value)) return (cur as { value: Val }).value;
  return undefined;
}

/** Стадия 13: ручные переопределения — последними, с сохранением вычисленного значения. */
export function applyOverrides(p: Pipeline, sheet: ComputedSheet): void {
  for (const [path, ov] of Object.entries(p.build.overrides)) {
    const v = resolveValPath(sheet, path);
    if (!v) {
      p.issues.push({ severity: 'warning', code: 'override_path', messageRu: `Переопределение «${path}» не применено: нет такого значения.` });
      continue;
    }
    v.overridden = { computed: v.value, reasonRu: ov.reasonRu };
    v.value = ov.value;
  }
}
