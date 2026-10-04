import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contentDataDir } from '@ps/content-data';

export type SrdDictionary = {
  classes: Record<string, string>;
  subclasses: Record<string, string>;
  races: Record<string, string>;
  subraces: Record<string, string>;
  backgrounds: Record<string, string>;
  feats: Record<string, string>;
  traits: Record<string, string>;
  features: Record<string, string>;
  equipment: Record<string, string>;
  spells: Record<string, string>;
  magicItems: Record<string, string>;
};

export function loadDictionary(): SrdDictionary {
  return JSON.parse(readFileSync(join(contentDataDir(), 'dictionaries', 'srd-ru.json'), 'utf8')) as SrdDictionary;
}

/** Перевод с учётом пропусков: отсутствующие ключи собираются для отчёта. */
export class Translator {
  readonly missing = new Map<string, Set<string>>();
  constructor(readonly dict: SrdDictionary) {}

  t(section: keyof SrdDictionary, key: string, fallback: string): string {
    const v = this.dict[section][key];
    if (v) return v;
    const set = this.missing.get(section) ?? new Set<string>();
    set.add(key);
    this.missing.set(section, set);
    return fallback;
  }
}
