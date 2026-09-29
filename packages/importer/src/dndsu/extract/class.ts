import type { Ability, ClassData, ClassSpellcasting, SkillId } from '@ps/content-schema';
import { pactSlots, singleClassCasterLevel, slotsForCasterLevel } from '@ps/rules-engine';
import type { MdTable } from '../parse/text';
import { findTermIds, norm, parseCount, type TermDictionary } from '../terms';
import { translitSlug } from '../../util/text';

/** «1к12 за каждый уровень варвара» → 12. */
export function parseHitDie(s: string | undefined): ClassData['hitDie'] | null {
  const m = s ? /\d*\s*[кd]\s*(6|8|10|12)(?!\d)/iu.exec(s) : null;
  return m ? (Number(m[1]) as ClassData['hitDie']) : null;
}

/** «Сила, Телосложение» → ['str', 'con']. */
export function parseSavingThrows(s: string | undefined, dict?: TermDictionary): [Ability, Ability] | null {
  const ids = s ? (findTermIds('abilities', s, dict) as Ability[]) : [];
  return ids.length === 2 ? [ids[0]!, ids[1]!] : null;
}

/** «Лёгкие доспехи, средние доспехи, щиты» → ['light', 'medium', 'shield']; «Все доспехи» → все три. */
export function parseArmor(s: string | undefined, dict?: TermDictionary): ClassData['proficiencies']['armor'] | null {
  if (!s) return null;
  if (/^нет/i.test(s.trim())) return [];
  const ids = findTermIds('armor', s, dict);
  const out = new Set<ClassData['proficiencies']['armor'][number]>();
  for (const id of ids) {
    if (id === 'all') ['light', 'medium', 'heavy'].forEach((x) => out.add(x as 'light'));
    else out.add(id as 'light');
  }
  return out.size ? [...out] : null;
}

/**
 * Оружие: категории («простое оружие, воинское оружие») + конкретные виды по словарю названий
 * (`weaponNames`: RU-название → slug). Нераспознанное возвращается в `unknown`.
 */
export function parseWeapons(
  s: string | undefined,
  weaponNames: Map<string, string>,
  dict?: TermDictionary,
): { weapons: string[]; unknown: string[] } | null {
  if (!s) return null;
  if (/^нет/i.test(s.trim())) return { weapons: [], unknown: [] };
  const weapons: string[] = [];
  const unknown: string[] = [];
  for (const part of s.split(/,|\sи\s/).map((x) => x.trim()).filter(Boolean)) {
    const cat = findTermIds('weaponCategories', part, dict);
    if (cat.length === 1 && /оружи/i.test(part)) {
      weapons.push(cat[0]!);
      continue;
    }
    const slug = matchName(part, weaponNames);
    if (slug) weapons.push(slug);
    else unknown.push(part);
  }
  return { weapons: [...new Set(weapons)], unknown };
}

/** Поиск по словарю названий с учётом множественного числа: «длинные мечи» ~ «длинный меч». */
export function matchName(text: string, names: Map<string, string>): string | undefined {
  const t = norm(text).replace(/[.;]$/, '').trim();
  const exact = names.get(t);
  if (exact) return exact;
  const stem = (w: string) => w.replace(/(ые|ий|ый|ой|ая|ое|ие|ов|ей|ы|и|а|я|ь)$/u, '');
  const key = t.split(/\s+/).map(stem).join(' ');
  for (const [name, slug] of names) {
    if (name.split(/\s+/).map(stem).join(' ') === key) return slug;
  }
  return undefined;
}

/** «Выберите два навыка из следующих: Атлетика, Внимательность…» → { choose: 2, from: [...] }. */
export function parseSkillChoice(s: string | undefined, dict?: TermDictionary): ClassData['proficiencies']['skills'] | null {
  if (!s) return null;
  const m = /выберите\s+(?:любые\s+)?(\p{L}+|\d+)/iu.exec(s);
  const choose = m ? parseCount(m[1]!) : undefined;
  if (!choose) return null;
  if (/любы\S*\s+\p{L}+\s+навык/iu.test(s) && !/из следующих/i.test(s)) return { choose, from: 'any' };
  const tail = s.slice(s.search(/из\s+следующих|из:/i) >= 0 ? s.search(/из\s+следующих|из:/i) : 0);
  const from = findTermIds('skills', tail, dict) as SkillId[];
  return from.length >= choose ? { choose, from } : null;
}

/** Известные колонки таблиц классов PHB → ключи `col()` (совпадают с пакетом `srd`). */
export const COLUMN_KEYS: Record<string, string> = {
  ярость: 'rages',
  'урон ярости': 'rage_damage',
  'кость вдохновения': 'bardic_inspiration',
  'вдохновение барда': 'bardic_inspiration',
  'известные заговоры': 'cantrips_known',
  'известные заклинания': 'spells_known',
  'боевые искусства': 'martial_arts',
  'очки ци': 'ki_points',
  'движение без доспехов': 'unarmored_movement',
  'скрытая атака': 'sneak_attack',
  'единицы чародейства': 'sorcery_points',
  'ячейки заклинаний': 'pact_slots',
  'уровень ячеек': 'pact_slot_level',
  'известные воззвания': 'invocations_known',
  'известные инфузии': 'infusions_known',
  'инфузированные предметы': 'infused_items',
};

export type ParsedClassTable = {
  columns: ClassData['columns'];
  levels: { level: number; featureNames: string[]; values: Record<string, string | number> }[];
  cantripsKnown?: number[];
  spellsKnown?: number[];
  /** Ячейки по уровням класса (9 колонок) — если в таблице есть колонки «1»…«9». */
  slots?: number[][];
  pact?: { count: number; level: number }[];
};

function cellValue(v: string): string | number {
  const t = v.trim();
  if (/^[—–-]$/.test(t) || t === '') return 0;
  if (/^[+]?\d+$/.test(t)) return Number(t.replace('+', ''));
  if (/^\d+\s*[кd]\s*\d+$/iu.test(t)) return t.replace(/к/giu, 'd').replace(/\s+/g, '');
  return t;
}

/** Таблица класса (20 строк) → колонки, значения по уровням, ячейки, известные заклинания. */
export function parseClassTable(table: MdTable): ParsedClassTable | null {
  const h = table.headers.map((x) => norm(x));
  const levelIdx = h.findIndex((x) => x === 'уровень');
  const featIdx = h.findIndex((x) => x === 'умения' || x === 'особенности');
  if (levelIdx < 0 || table.rows.length < 20) return null;
  const pbIdx = h.findIndex((x) => /бонус мастерства/.test(x));
  const slotIdx = Array.from({ length: 9 }, (_, i) => h.findIndex((x) => x === String(i + 1) || x === `${i + 1}-й`));
  const skip = new Set([levelIdx, featIdx, pbIdx, ...slotIdx.filter((i) => i >= 0)]);
  const colDefs: { idx: number; key: string; labelRu: string }[] = [];
  h.forEach((label, idx) => {
    if (skip.has(idx)) return;
    colDefs.push({ idx, key: COLUMN_KEYS[label] ?? translitSlug(label).replace(/-/g, '_'), labelRu: table.headers[idx]! });
  });
  const levels: ParsedClassTable['levels'] = [];
  for (const row of table.rows.slice(0, 20)) {
    const level = Number(/(\d+)/.exec(row[levelIdx] ?? '')?.[1]);
    if (!level) return null;
    const featureNames =
      featIdx >= 0
        ? (row[featIdx] ?? '')
            .split(/,\s*/)
            .map((x) => x.trim())
            .filter((x) => x && !/^[—–-]$/.test(x))
        : [];
    const values: Record<string, string | number> = {};
    for (const c of colDefs) values[c.key] = cellValue(row[c.idx] ?? '');
    const hasSlots = slotIdx.some((i) => i >= 0);
    if (hasSlots) {
      slotIdx.forEach((i, n) => {
        values[`slots_${n + 1}`] = i >= 0 ? Number(cellValue(row[i] ?? '')) || 0 : 0;
      });
    }
    levels.push({ level, featureNames, values });
  }
  const out: ParsedClassTable = {
    columns: colDefs
      .filter((c) => !['cantrips_known', 'spells_known', 'pact_slots', 'pact_slot_level'].includes(c.key))
      .map((c) => ({ key: c.key, labelRu: c.labelRu })),
    levels,
  };
  const num = (k: string) => levels.map((l) => Number(l.values[k] ?? 0) || 0);
  if (colDefs.some((c) => c.key === 'cantrips_known')) out.cantripsKnown = num('cantrips_known');
  if (colDefs.some((c) => c.key === 'spells_known')) out.spellsKnown = num('spells_known');
  if (slotIdx.some((i) => i >= 0)) out.slots = levels.map((l) => Array.from({ length: 9 }, (_, i) => Number(l.values[`slots_${i + 1}`]) || 0));
  if (colDefs.some((c) => c.key === 'pact_slots')) {
    const lvl = levels.map((l) => Number(/(\d)/.exec(String(l.values.pact_slot_level ?? ''))?.[1] ?? 0));
    out.pact = levels.map((l, i) => ({ count: Number(l.values.pact_slots) || 0, level: lvl[i]! }));
  }
  return out;
}

const PROGRESSIONS: ClassSpellcasting['progression'][] = ['full', 'half', 'half_up', 'third'];

/** Прогрессия заклинателя по таблице ячеек: сравнение с таблицами движка (SPEC §8.12). */
export function inferProgression(t: ParsedClassTable): ClassSpellcasting['progression'] | null {
  if (t.pact) {
    const ok = t.pact.every((p, i) => {
      const e = pactSlots(i + 1);
      return e.count === p.count && e.level === p.level;
    });
    return ok ? 'pact' : null;
  }
  if (!t.slots) return null;
  for (const p of PROGRESSIONS) {
    const ok = t.slots.every((row, i) => {
      const exp = slotsForCasterLevel(singleClassCasterLevel(p, i + 1));
      return row.every((n, j) => n === (exp[j] ?? 0));
    });
    if (ok) return p;
  }
  return null;
}

/** Уровни «Увеличения характеристик» по колонке умений. */
export function asiLevelsOf(t: ParsedClassTable): number[] {
  return t.levels.filter((l) => l.featureNames.some((n) => /увеличение характеристик/i.test(n))).map((l) => l.level);
}

/** Базовая характеристика заклинаний: «…базовой характеристикой является Интеллект». */
export function parseSpellAbility(md: string, dict?: TermDictionary): Ability | null {
  const m = /базов\S*\s+характеристик\S*[^.]{0,80}?(сил\S*|ловкост\S*|телосложени\S*|интеллект\S*|мудрост\S*|харизм\S*)/iu.exec(md);
  if (!m) return null;
  return (findTermIds('abilities', m[1]!, dict)[0] as Ability | undefined) ?? null;
}
