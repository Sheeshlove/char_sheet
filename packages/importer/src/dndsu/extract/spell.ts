import { normalizeDice, type Ability, type DamageType, type SpellData } from '@ps/content-schema';
import { findTerm, findTermIds, norm, type TermDictionary } from '../terms';

type Problem = { field: string; value?: string };

/** «3 уровень, воплощение», «Заговор, вызов», «1 уровень, прорицание (ритуал)». */
export function parseLevelSchool(s: string | undefined, dict?: TermDictionary) {
  if (!s) return null;
  const t = norm(s);
  const level = /заговор/.test(t) ? 0 : Number(/(\d)\s*(?:-?й)?\s*уров/.exec(t)?.[1] ?? NaN);
  const school = findTerm('schools', s, dict) as SpellData['school'] | undefined;
  if (!Number.isInteger(level) || !school) return null;
  return { level, school, ritual: /ритуал/.test(t) };
}

/** Время накладывания: «1 действие», «1 бонусное действие», «1 реакция, …», «10 минут», «8 часов». */
export function parseCastingTime(s: string | undefined): SpellData['castingTime'] | null {
  if (!s) return null;
  const t = norm(s);
  const amount = Number(/^(\d+)/.exec(t)?.[1] ?? 1);
  let unit: SpellData['castingTime']['unit'];
  if (/бонусн\S* действи/.test(t)) unit = 'bonus_action';
  else if (/^\d*\s*действи/.test(t)) unit = 'action';
  else if (/реакци/.test(t)) unit = 'reaction';
  else if (/минут/.test(t)) unit = 'minute';
  else if (/час/.test(t)) unit = 'hour';
  else unit = 'special';
  return { textRu: s.trim(), unit, amount };
}

/** Дистанция: «На себя», «Касание», «150 футов», «1 миля», «В пределах видимости», «Неограниченная». */
export function parseRange(s: string | undefined): SpellData['range'] | null {
  if (!s) return null;
  const t = norm(s);
  const textRu = s.trim();
  if (/^на себя|^себя/.test(t)) return { textRu, kind: 'self' };
  if (/^касани/.test(t)) return { textRu, kind: 'touch' };
  if (/видимост/.test(t)) return { textRu, kind: 'sight' };
  if (/неограниченн|без ограничени/.test(t)) return { textRu, kind: 'unlimited' };
  const ft = /^(\d[\d\s]*)\s*(?:фут|фт)/.exec(t);
  if (ft) return { textRu, kind: 'ranged', feet: Number(ft[1]!.replace(/\s/g, '')) };
  const mi = /^(\d[\d\s]*)\s*мил/.exec(t);
  if (mi) return { textRu, kind: 'ranged', feet: Number(mi[1]!.replace(/\s/g, '')) * 5280 };
  if (/особ/.test(t)) return { textRu, kind: 'special' };
  return null;
}

/** Компоненты: «В, С, М (алмаз стоимостью не менее 300 зм, который расходуется)». */
export function parseComponents(s: string | undefined): SpellData['components'] | null {
  if (!s) return null;
  const paren = s.indexOf('(');
  const head = norm(paren >= 0 ? s.slice(0, paren) : s);
  const letters = head
    .split(/[,\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (!letters.length || letters.some((l) => !['в', 'с', 'м'].includes(l))) return null;
  const out: SpellData['components'] = { v: letters.includes('в'), s: letters.includes('с'), m: letters.includes('м') };
  if (out.m && paren >= 0) {
    const material = s.slice(paren + 1).replace(/\)\s*$/, '').trim();
    out.materialRu = material;
    const cost = /(\d[\d\s]*)\s*зм/.exec(material);
    if (cost) out.costGp = Number(cost[1]!.replace(/\s/g, ''));
    if (/расходует|поглощает|уничтожает/i.test(material)) out.consumed = true;
  }
  return out;
}

/** Длительность: «Концентрация, вплоть до 1 минуты», «Мгновенная». */
export function parseDuration(s: string | undefined): SpellData['duration'] | null {
  if (!s) return null;
  return { textRu: s.trim(), concentration: /концентрац/i.test(s) };
}

/** Классы: «волшебник, чародей» → id классов. */
export function parseClasses(s: string | undefined, dict?: TermDictionary): string[] {
  return s ? findTermIds('classes', s, dict) : [];
}

const DICE_RE = /(\d+)\s*[кd]\s*(\d+)/giu;

function sentences(md: string): string[] {
  return md
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[А-ЯЁA-Z])/u)
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * Механика из текста заклинания: урон (кубы + тип), спасбросок, атака, лечение, масштабирование.
 * Только однозначные совпадения; прочее остаётся текстом.
 */
export function parseSpellMechanics(
  md: string,
  level: number,
  higherLevelsMd: string | undefined,
  dict?: TermDictionary,
): Pick<SpellData, 'attack' | 'save' | 'damage' | 'heal'> {
  const out: Pick<SpellData, 'attack' | 'save' | 'damage' | 'heal'> = {};
  const t = norm(md);
  if (/рукопашн\S*\s+атак\S*\s+заклинани/.test(t)) out.attack = 'melee';
  else if (/дальнобойн\S*\s+атак\S*\s+заклинани/.test(t)) out.attack = 'ranged';

  const save = /спасброс\S*\s+(\p{L}+)/u.exec(md);
  if (save) {
    const a = findTerm('abilities', save[1]!, dict) as Ability | undefined;
    if (a) out.save = a;
  }

  const cantripScaling = level === 0 && /5[\s-]*(?:го|м)?\s*уровн/.test(t) && /11/.test(t) && /17/.test(t);
  const slotScaling = level > 0 && !!higherLevelsMd && DICE_RE.test(higherLevelsMd);
  DICE_RE.lastIndex = 0;

  const damage: NonNullable<SpellData['damage']> = [];
  for (const sentence of sentences(md)) {
    if (!/урон/i.test(sentence)) continue;
    if (/на (?:больших|более высоких) уровнях/i.test(sentence)) continue;
    const dice = [...sentence.matchAll(DICE_RE)];
    const types = findTermIds('damageTypes', sentence.slice(sentence.search(/урон/i)), dict) as DamageType[];
    if (dice.length !== 1 || types.length !== 1) continue;
    const d = normalizeDice(`${dice[0]![1]}к${dice[0]![2]}`);
    if (damage.some((x) => x.dice === d && x.type === types[0])) continue;
    damage.push({
      dice: d,
      type: types[0]!,
      ...(cantripScaling ? { scaling: 'cantrip' as const } : slotScaling ? { scaling: 'slot' as const } : {}),
    });
  }
  if (damage.length) out.damage = damage;

  const healSentence = sentences(md).find((x) => /восстанавлива/i.test(x) && /хит/i.test(x) && /\d+\s*к\s*\d+/iu.test(x));
  const heal = healSentence ? /восстанавлива\S*[^.]*?(\d+\s*к\s*\d+)/iu.exec(healSentence) : null;
  if (heal && !damage.length) {
    out.heal = {
      dice: normalizeDice(heal[1]!),
      addSpellMod: /модификатор\S*\s+(?:вашей\s+)?(?:базовой\s+)?характеристики\s+заклинател|модификатор\S*\s+(?:вашей\s+)?базов/i.test(md),
      ...(slotScaling ? { scaling: 'slot' as const } : {}),
    };
  }
  return out;
}

export type SpellFields = {
  levelSchool?: string;
  castingTime?: string;
  range?: string;
  components?: string;
  duration?: string;
  classes?: string;
  subclasses?: string;
  higherLevels?: string;
};

/**
 * Все структурированные поля `SpellData` (SPEC §7.6). Нераспознанные поля перечисляются в `problems`
 * (для отчёта: 100 % или список исключений, SPEC §17 M5).
 */
export function extractSpell(
  f: SpellFields,
  bodyMd: string,
  dict?: TermDictionary,
): { data: Omit<SpellData, 'subclasses'> | null; problems: Problem[] } {
  const problems: Problem[] = [];
  const ls = parseLevelSchool(f.levelSchool, dict);
  if (!ls) problems.push({ field: 'levelSchool', value: f.levelSchool });
  const castingTime = parseCastingTime(f.castingTime);
  if (!castingTime) problems.push({ field: 'castingTime', value: f.castingTime });
  const range = parseRange(f.range);
  if (!range) problems.push({ field: 'range', value: f.range });
  const components = parseComponents(f.components);
  if (!components) problems.push({ field: 'components', value: f.components });
  const duration = parseDuration(f.duration);
  if (!duration) problems.push({ field: 'duration', value: f.duration });
  const classes = parseClasses(f.classes, dict);
  if (!classes.length) problems.push({ field: 'classes', value: f.classes });
  if (!ls || !castingTime || !range || !components || !duration) return { data: null, problems };
  const ritual = ls.ritual || /ритуал/i.test(f.castingTime ?? '');
  return {
    data: {
      level: ls.level,
      school: ls.school,
      castingTime,
      ritual,
      range,
      components,
      duration,
      classes,
      ...parseSpellMechanics(bodyMd, ls.level, f.higherLevels, dict),
      ...(f.higherLevels ? { higherLevelsMd: f.higherLevels } : {}),
    },
    problems,
  };
}
