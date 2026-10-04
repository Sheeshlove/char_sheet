import type { z } from 'zod';
import { contentKeySchema, exprSchema, profTargetSchema, rollTargetSchema, statTargetSchema } from '@ps/content-schema';
import {
  ABILITY_LABEL_RU,
  ARMOR_CATEGORY_LABEL_RU,
  CONDITION_LABEL_RU,
  DAMAGE_TYPE_LABEL_RU,
  SCHOOL_LABEL_RU,
  SIZE_LABEL_RU,
  SKILL_LABEL_RU,
} from '@ps/rules-engine';
import { ru } from '@/i18n/ru';

/**
 * Разбор zod-схем для генератора форм homebrew (SPEC §14: «форма строится по zod-схеме вида»).
 * Используются только публичные поля определения схемы (`_zod.def`).
 */

export type Schema = z.ZodType;
export type Def = {
  type: string;
  shape?: Record<string, Schema>;
  element?: Schema;
  items?: Schema[];
  options?: Schema[];
  discriminator?: string;
  entries?: Record<string, string>;
  values?: unknown[];
  innerType?: Schema;
  defaultValue?: unknown;
  keyType?: Schema;
  valueType?: Schema;
  getter?: () => Schema;
  in?: Schema;
};

export const def = (s: Schema): Def => (s as unknown as { _zod: { def: Def } })._zod.def;

/** Особые строковые поля — определяются по самой схеме (те же объекты, что в `@ps/content-schema`). */
export type Special = 'expr' | 'contentKey' | 'statTarget' | 'rollTarget' | 'profTarget' | null;
export function special(s: Schema): Special {
  if (s === exprSchema) return 'expr';
  if (s === contentKeySchema) return 'contentKey';
  if (s === statTargetSchema) return 'statTarget';
  if (s === rollTargetSchema) return 'rollTarget';
  if (s === profTargetSchema) return 'profTarget';
  return null;
}

/** Снять обёртки `lazy`/`pipe` (optional/nullable/default разбираются в форме отдельно). */
export function resolve(s: Schema): Schema {
  let cur = s;
  for (let i = 0; i < 10; i++) {
    const d = def(cur);
    if (d.type === 'lazy' && d.getter) cur = d.getter();
    else if (d.type === 'pipe' && d.in) cur = d.in;
    else break;
  }
  return cur;
}

const randomId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 7)}`;

/** Значение по умолчанию для нового поля/элемента списка. */
export function defaultOf(schema: Schema, name?: string): unknown {
  const s = resolve(schema);
  const d = def(s);
  switch (d.type) {
    case 'optional':
      return undefined;
    case 'nullable':
      return null;
    case 'default':
      return typeof d.defaultValue === 'function' ? (d.defaultValue as () => unknown)() : d.defaultValue;
    case 'string':
      if (special(s) === 'expr') return '0';
      if (name === 'key') return randomId('feature');
      if (name === 'id') return randomId('id');
      if (special(s) === 'statTarget' || special(s) === 'rollTarget') return 'ac';
      if (special(s) === 'profTarget') return 'skill:athletics';
      return '';
    case 'number': {
      const min = (s as unknown as { minValue?: number | null }).minValue;
      return typeof min === 'number' && Number.isFinite(min) && min > 0 ? min : 0;
    }
    case 'boolean':
      return false;
    case 'enum':
      return Object.values(d.entries ?? {})[0];
    case 'literal':
      return d.values?.[0];
    case 'object': {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(d.shape ?? {})) {
        const dv = defaultOf(v, k);
        if (dv !== undefined) out[k] = dv;
      }
      return out;
    }
    case 'array':
      return [];
    case 'tuple':
      return (d.items ?? []).map((it) => defaultOf(it));
    case 'record':
      return {};
    case 'union':
      return d.options?.length ? defaultOf(d.options[0]!, name) : undefined;
    default:
      return undefined;
  }
}

/** Вариант объединения, которому соответствует значение. */
export function unionIndex(options: Schema[], value: unknown, discriminator?: string): number {
  if (discriminator && value && typeof value === 'object') {
    const v = (value as Record<string, unknown>)[discriminator];
    const i = options.findIndex((o) => def(def(resolve(o)).shape?.[discriminator] ?? o).values?.includes(v));
    if (i >= 0) return i;
  }
  const exact = options.findIndex((o) => o.safeParse(value).success);
  if (exact >= 0) return exact;
  const t = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
  const byType = options.findIndex((o) => {
    const ot = def(resolve(o)).type;
    return ot === t || (t === 'string' && ot === 'enum') || (t === 'object' && ot === 'record');
  });
  return byType >= 0 ? byType : 0;
}

const H = ru.homebrew;

/** Подпись поля по имени ключа. */
export function fieldLabel(name: string | undefined): string {
  if (!name) return '';
  return H.fields[name] ?? name;
}

const ENUM_LABELS: Record<string, string> = {
  ...H.enums,
  ...SKILL_LABEL_RU,
  ...DAMAGE_TYPE_LABEL_RU,
  ...CONDITION_LABEL_RU,
  ...SCHOOL_LABEL_RU,
  ...SIZE_LABEL_RU,
  ...ARMOR_CATEGORY_LABEL_RU,
  ...ABILITY_LABEL_RU,
};

/** Подпись значения перечисления (или литерала варианта). */
export function enumLabel(value: unknown, context?: 'effectType'): string {
  const v = String(value);
  if (context === 'effectType') return H.effectTypes[v] ?? v;
  return ENUM_LABELS[v] ?? v;
}

/** Подпись варианта объединения без дискриминатора. */
export function variantLabel(option: Schema): string {
  const o = resolve(option);
  const d = def(o);
  if (d.type === 'literal') return enumLabel(d.values?.[0]);
  if (d.type === 'object') {
    const first = Object.keys(d.shape ?? {})[0];
    return fieldLabel(first);
  }
  if (d.type === 'string' && special(o) === 'expr') return H.unionVariants.string!;
  if (d.type === 'enum') return Object.values(d.entries ?? {}).map((v) => enumLabel(v)).join(' / ');
  return H.unionVariants[d.type] ?? d.type;
}
