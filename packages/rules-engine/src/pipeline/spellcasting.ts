import type { ClassSpellcasting, ContentKey } from '@ps/content-schema';
import {
  defaultSpellcastingStart,
  maxSpellLevelFor,
  multiclassCasterContribution,
  pactSlots,
  singleClassCasterLevel,
  slotsForCasterLevel,
} from '../tables/spell-slots';
import type { ChoiceInfo, ComputedSheet, SpellcastingClass, SpellEntry, ValPart } from '../types';
import { choiceKey, makeVal, type Pipeline } from './context';
import { bonusParts, labelOf } from './helpers';

export type CasterInfo = {
  classKey: string;
  nameRu: string;
  level: number;
  sc: ClassSpellcasting;
  subclassKey?: string;
};

/** Классы, которые на текущем уровне уже заклинатели (SPEC §8.9). */
export function casterClasses(p: Pipeline): CasterInfo[] {
  const out: CasterInfo[] = [];
  for (const [classKey, level] of p.classLevels) {
    if (level <= 0) continue;
    const cls = p.content.getOf(classKey, 'class');
    if (!cls) continue;
    const subKey = p.subclassOf.get(classKey);
    const sub = subKey ? p.content.getOf(subKey, 'subclass') : undefined;
    const sc = cls.data.spellcasting ?? sub?.data.spellcasting;
    if (!sc) continue;
    const start = sc.startLevel ?? defaultSpellcastingStart(sc.progression);
    if (level < start) continue;
    out.push({ classKey, nameRu: cls.nameRu, level, sc, subclassKey: subKey });
  }
  return out;
}

/** Уровень заклинателя для ячеек (без магии договора). */
export function casterLevelFor(casters: CasterInfo[]): number {
  const regular = casters.filter((c) => c.sc.progression !== 'pact');
  if (regular.length === 1) return singleClassCasterLevel(regular[0]!.sc.progression, regular[0]!.level);
  return regular.reduce((s, c) => s + multiclassCasterContribution(c.sc.progression, c.level), 0);
}

/** Ключи заклинаний, доступных классу: список класса + расширения + подкласс. */
export function classSpellPool(p: Pipeline, c: CasterInfo): Set<ContentKey> {
  const pool = new Set(p.content.spellList(c.sc.spellListKey));
  for (const { effect } of p.active('spell_list_extend')) {
    if (effect.list === c.sc.spellListKey) for (const k of effect.spells) pool.add(k);
  }
  const sub = c.subclassKey ? p.content.getOf(c.subclassKey, 'subclass') : undefined;
  for (const e of sub?.data.expandedSpellList ?? []) for (const k of e.spells) pool.add(k);
  return pool;
}

function spellEntry(p: Pipeline, key: ContentKey, source: SpellEntry['source'], prepared: boolean, always = false): SpellEntry | null {
  const s = p.content.getOf(key, 'spell');
  if (!s) {
    p.issues.push({ severity: 'warning', code: 'content_missing', messageRu: `Заклинание не найдено: ${key}` });
    return null;
  }
  return {
    key,
    nameRu: s.nameRu,
    level: s.data.level,
    prepared,
    alwaysPrepared: always,
    ritual: s.data.ritual,
    concentration: s.data.duration.concentration,
    source,
  };
}

function spellOptions(p: Pipeline, pool: Set<ContentKey>, pred: (lvl: number, school: string) => boolean) {
  const out: { value: string; labelRu: string; hintRu?: string }[] = [];
  for (const k of pool) {
    const s = p.content.getOf(k, 'spell');
    if (s && pred(s.data.level, s.data.school)) out.push({ value: k, labelRu: s.nameRu, hintRu: s.data.level ? `${s.data.level} круг` : 'заговор' });
  }
  return out.sort((a, b) => a.labelRu.localeCompare(b.labelRu, 'ru'));
}

/** Стадия 11: заклинательство. */
export function computeSpellcasting(p: Pipeline): { spellcasting: ComputedSheet['spellcasting']; choices: ChoiceInfo[] } {
  const casters = casterClasses(p);
  const choices: ChoiceInfo[] = [];
  const casterLevel = casterLevelFor(casters);
  const slotCounts = slotsForCasterLevel(casterLevel);
  const slots = slotCounts
    .map((max, i) => ({ level: i + 1, max, used: Math.min(max, p.state.slotsUsed[i + 1] ?? 0) }))
    .filter((s) => s.max > 0);

  const warlock = casters.find((c) => c.sc.progression === 'pact');
  const pactInfo = warlock ? pactSlots(warlock.level) : null;
  const pact =
    pactInfo && pactInfo.count > 0
      ? { level: pactInfo.level, max: pactInfo.count, used: Math.min(pactInfo.count, p.state.pactSlotsUsed) }
      : undefined;

  const classes: SpellcastingClass[] = [];
  for (const c of casters) {
    const ability = c.sc.ability;
    const mod = p.abilities![ability].mod;
    const dcParts: ValPart[] = [
      { labelRu: 'Базовое значение', value: 8 },
      { labelRu: 'Бонус мастерства', value: p.pb },
      { labelRu: 'Модификатор характеристики', value: mod },
      ...bonusParts(p, ['spell_dc']),
    ];
    const atkParts: ValPart[] = [
      { labelRu: 'Бонус мастерства', value: p.pb },
      { labelRu: 'Модификатор характеристики', value: mod },
      ...bonusParts(p, ['attack:spell']),
    ];
    const idx = Math.min(20, c.level) - 1;
    const cantripsMax = c.sc.cantripsKnown?.[idx];
    const knownMax = c.sc.preparation === 'known' ? c.sc.spellsKnown?.[idx] : undefined;
    const preparedMax =
      c.sc.preparation !== 'known' && c.sc.preparedFormula
        ? Math.max(1, Math.floor(p.num(c.sc.preparedFormula, { sourceKey: c.classKey, sourceLabelRu: c.nameRu, featureKey: 'spellcasting', classKey: c.classKey })))
        : undefined;
    const spellbookFree = c.sc.preparation === 'spellbook' ? 6 + 2 * (c.level - 1) : undefined;
    const maxSpellLevel = maxSpellLevelFor(c.sc.progression, c.level);

    const known = p.build.knownSpells.find((k) => k.classKey === c.classKey);
    const prepared = new Set(p.state.prepared[c.classKey] ?? []);
    const spells: SpellEntry[] = [];
    const push = (e: SpellEntry | null) => {
      if (e && !spells.some((s) => s.key === e.key)) spells.push(e);
    };

    // Всегда подготовленные заклинания подкласса
    const sub = c.subclassKey ? p.content.getOf(c.subclassKey, 'subclass') : undefined;
    const always = new Set<string>();
    for (const e of sub?.data.alwaysPrepared ?? []) {
      if (c.level >= e.classLevel) for (const k of e.spells) always.add(k);
    }
    for (const k of always) push(spellEntry(p, k, 'always', true, true));
    for (const k of known?.cantrips ?? []) push(spellEntry(p, k, 'cantrip', true));
    if (c.sc.preparation === 'known') {
      for (const k of known?.spells ?? []) push(spellEntry(p, k, 'known', true));
    } else if (c.sc.preparation === 'spellbook') {
      for (const k of known?.spellbook ?? []) push(spellEntry(p, k, 'spellbook', prepared.has(k)));
    } else {
      for (const k of prepared) push(spellEntry(p, k, 'known', true));
    }
    spells.sort((a, b) => a.level - b.level || a.nameRu.localeCompare(b.nameRu, 'ru'));

    const preparedCount = c.sc.preparation === 'known' ? 0 : [...prepared].filter((k) => !always.has(k)).length;
    if (preparedMax !== undefined && preparedCount > preparedMax) {
      p.issues.push({
        severity: 'warning',
        code: 'too_many_prepared',
        messageRu: `${c.nameRu}: подготовлено ${preparedCount} заклинаний при максимуме ${preparedMax}.`,
      });
    }

    const pool = classSpellPool(p, c);
    if (cantripsMax !== undefined && cantripsMax > 0) {
      const selected = (known?.cantrips ?? []).slice(0, cantripsMax);
      choices.push({
        key: `spells:${c.classKey}:cantrips`,
        kind: 'spells',
        labelRu: `${c.nameRu}: заговоры`,
        sourceKey: c.classKey,
        sourceLabelRu: c.nameRu,
        choose: cantripsMax,
        selected,
        options: spellOptions(p, pool, (lvl) => lvl === 0),
        classKey: c.classKey,
      });
    }
    if (knownMax !== undefined && knownMax > 0) {
      const selected = (known?.spells ?? []).slice(0, knownMax);
      choices.push({
        key: `spells:${c.classKey}:known`,
        kind: 'spells',
        labelRu: `${c.nameRu}: известные заклинания`,
        sourceKey: c.classKey,
        sourceLabelRu: c.nameRu,
        choose: knownMax,
        selected,
        // Ограничение школ проверяется в validateBuild с учётом «свободных» выборов.
        options: spellOptions(p, pool, (lvl) => lvl >= 1 && lvl <= maxSpellLevel),
        classKey: c.classKey,
      });
    }
    if (spellbookFree !== undefined) {
      const book = known?.spellbook ?? [];
      choices.push({
        key: `spells:${c.classKey}:spellbook`,
        kind: 'spellbook',
        labelRu: `${c.nameRu}: книга заклинаний`,
        sourceKey: c.classKey,
        sourceLabelRu: c.nameRu,
        choose: spellbookFree,
        selected: book.slice(0, Math.max(spellbookFree, book.length)),
        options: spellOptions(p, pool, (lvl) => lvl >= 1 && lvl <= maxSpellLevel),
        classKey: c.classKey,
      });
    }

    classes.push({
      classKey: c.classKey,
      nameRu: c.nameRu,
      ability,
      dc: makeVal(dcParts),
      attack: makeVal(atkParts),
      cantripsMax,
      knownMax,
      preparedMax,
      spellbookFree,
      maxSpellLevel,
      ritual: c.sc.ritualCasting,
      preparation: c.sc.preparation,
      progression: c.sc.progression,
      spellListKey: c.sc.spellListKey,
      schoolRestriction: c.sc.schoolRestriction,
      spells,
    });
  }

  // Заклинания, дарованные эффектами (расы, черты, подклассы)
  const grants: ComputedSheet['spellcasting']['grants'] = [];
  for (const { effect, src } of p.active('spell_grant')) {
    if (effect.minCharacterLevel && p.totalLevel < effect.minCharacterLevel) continue;
    const keys =
      typeof effect.spell === 'string' ? [effect.spell] : (p.choiceSelections.get(choiceKey(src, effect.spell.choice)) ?? []);
    for (const key of keys) {
      const s = p.content.getOf(key, 'spell');
      const id = `${src.sourceKey}#${src.featureKey}#${key}`;
      if (grants.some((g) => g.id === id)) continue;
      const ability = effect.ability === 'class' ? p.spellcastingAbility(src.classKey) : effect.ability;
      const uses = effect.uses
        ? {
            max: Math.max(0, Math.floor(p.num(effect.uses.count, src))),
            used: p.state.grantUsesUsed[id] ?? 0,
            reset: effect.uses.reset,
          }
        : undefined;
      grants.push({
        id,
        spellKey: key,
        nameRu: s?.nameRu ?? key,
        mode: effect.mode,
        ability,
        castAtLevel: effect.castAtLevel,
        uses,
        sourceLabelRu: labelOf(src),
      });
    }
  }

  if (p.cannotCast && (classes.length || grants.length)) {
    p.issues.push({ severity: 'warning', code: 'cannot_cast_armor', messageRu: 'Нельзя накладывать заклинания в доспехе без владения.' });
  }

  return { spellcasting: { classes, slots, pact, grants, casterLevel }, choices };
}

/** Все заклинания, известные персонажу (для переключателей «заклинание действует»). */
export function knownSpellKeys(p: Pipeline): string[] {
  const keys: string[] = [];
  for (const k of p.build.knownSpells) keys.push(...k.cantrips, ...k.spells, ...(k.spellbook ?? []));
  for (const list of Object.values(p.state.prepared)) keys.push(...list);
  for (const c of casterClasses(p)) {
    const sub = c.subclassKey ? p.content.getOf(c.subclassKey, 'subclass') : undefined;
    for (const e of sub?.data.alwaysPrepared ?? []) if (c.level >= e.classLevel) keys.push(...e.spells);
  }
  for (const { effect, src } of p.ofType('spell_grant')) {
    if (typeof effect.spell === 'string') keys.push(effect.spell);
    else keys.push(...(p.choiceSelections.get(choiceKey(src, effect.spell.choice)) ?? []));
  }
  return keys;
}
