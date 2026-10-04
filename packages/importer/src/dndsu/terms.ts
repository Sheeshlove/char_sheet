import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contentDataDir } from '@ps/content-data';

export type TermSection =
  | 'abilities'
  | 'damageTypes'
  | 'schools'
  | 'classes'
  | 'skills'
  | 'sizes'
  | 'armor'
  | 'weaponCategories'
  | 'languages'
  | 'rarity'
  | 'itemTypes';

export type TermDictionary = Record<TermSection, Record<string, string>>;

export type TermMatch = { id: string; index: number; length: number; term: string };

let cached: TermDictionary | null = null;

export function loadTerms(): TermDictionary {
  if (!cached) {
    const raw = JSON.parse(readFileSync(join(contentDataDir(), 'dictionaries', 'terms-ru.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    delete raw._comment;
    cached = raw as TermDictionary;
  }
  return cached;
}

/** Нижний регистр и «ё» → «е»: так словарь не зависит от написания. */
export function norm(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е');
}

/**
 * Все вхождения терминов секции в тексте по порядку. Термин совпадает с началом слова
 * (основа: «огн» → «огнём», «огнем»); при пересечении побеждает более длинный.
 */
export function findTerms(section: TermSection, text: string, dict: TermDictionary = loadTerms()): TermMatch[] {
  const t = norm(text);
  const found: TermMatch[] = [];
  for (const [term, id] of Object.entries(dict[section])) {
    const n = norm(term);
    const re = new RegExp(`(?<![\\p{L}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gu');
    for (const m of t.matchAll(re)) found.push({ id, index: m.index, length: n.length, term });
  }
  found.sort((a, b) => a.index - b.index || b.length - a.length);
  const out: TermMatch[] = [];
  let end = -1;
  for (const m of found) {
    if (m.index < end) continue;
    out.push(m);
    end = m.index + m.length;
  }
  return out;
}

/** Первый термин секции в тексте. */
export function findTerm(section: TermSection, text: string, dict?: TermDictionary): string | undefined {
  return findTerms(section, text, dict)[0]?.id;
}

/** Уникальные id терминов в порядке появления. */
export function findTermIds(section: TermSection, text: string, dict?: TermDictionary): string[] {
  return [...new Set(findTerms(section, text, dict).map((m) => m.id))];
}

const NUMBER_WORDS: Record<string, number> = {
  один: 1,
  одну: 1,
  одного: 1,
  одним: 1,
  одном: 1,
  два: 2,
  две: 2,
  двух: 2,
  три: 3,
  трёх: 3,
  трех: 3,
  четыре: 4,
  четырёх: 4,
  четырех: 4,
  пять: 5,
  пяти: 5,
  шесть: 6,
};

/** Число цифрами или словом («два», «трёх») → число. */
export function parseCount(word: string): number | undefined {
  const w = norm(word.trim());
  if (/^\d+$/.test(w)) return Number(w);
  return NUMBER_WORDS[w] ?? NUMBER_WORDS[word.trim().toLowerCase()];
}
