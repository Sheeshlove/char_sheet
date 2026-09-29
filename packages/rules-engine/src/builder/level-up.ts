import { clone } from '../util';
import {
  ABILITIES,
  emptyState,
  type Ability,
  type CampaignSettings,
  type CharacterBuild,
  type CharacterState,
} from '@ps/content-schema';
import type { ContentIndex } from '../content-index';
import { computeWithPipeline } from '../compute';
import { defaultSpellcastingStart, maxSpellLevelFor } from '../tables/spell-slots';
import { nextLevelXp } from '../tables/xp';
import { CommandError, type LevelUpClassOption, type LevelUpDecision, type LevelUpOptions } from '../types';
import { describeRequirement, meetsMulticlass } from './validate';

function classSpellInfo(
  content: ContentIndex,
  classKey: string,
  subclassKey: string | undefined,
  cur: number,
  next: number,
): LevelUpClassOption['spells'] {
  const cls = content.getOf(classKey, 'class');
  const sub = subclassKey ? content.getOf(subclassKey, 'subclass') : undefined;
  const sc = cls?.data.spellcasting ?? sub?.data.spellcasting;
  if (!sc) return undefined;
  const start = sc.startLevel ?? defaultSpellcastingStart(sc.progression);
  if (next < start) return undefined;
  const at = (arr: number[] | undefined, lvl: number) => (lvl >= 1 && arr ? (arr[lvl - 1] ?? 0) : 0);
  const wasCaster = cur >= start;
  return {
    cantripsGain: at(sc.cantripsKnown, next) - (wasCaster ? at(sc.cantripsKnown, cur) : 0),
    knownGain: sc.preparation === 'known' ? at(sc.spellsKnown, next) - (wasCaster ? at(sc.spellsKnown, cur) : 0) : 0,
    spellbookGain: sc.preparation === 'spellbook' ? (cur === 0 ? 6 : 2) : 0,
    canReplaceKnown: sc.preparation === 'known' && wasCaster,
    maxSpellLevel: maxSpellLevelFor(sc.progression, next),
  };
}

/** Варианты повышения уровня (SPEC §10). */
export function levelUpOptions(
  build: CharacterBuild,
  content: ContentIndex,
  rules: CampaignSettings,
  state?: CharacterState,
): LevelUpOptions {
  const current = build.levels.length;
  const nextLevel = current + 1;
  const { sheet } = computeWithPipeline(build, state ?? emptyState(), content, rules);
  const scores = Object.fromEntries(ABILITIES.map((a) => [a, sheet.abilities[a].score.value])) as Record<Ability, number>;
  const hpMethods: ('average' | 'roll')[] =
    rules.hpMethod === 'average' ? ['average'] : rules.hpMethod === 'roll' ? ['roll'] : ['average', 'roll'];

  let canLevelUp = current < 20;
  let reasonRu: string | undefined = current >= 20 ? 'Достигнут 20 уровень.' : undefined;
  if (canLevelUp && state && rules.leveling === 'xp') {
    const need = nextLevelXp(current);
    if (need !== null && state.xp < need) {
      canLevelUp = false;
      reasonRu = `Нужно ${need} опыта (сейчас ${state.xp}).`;
    }
  }

  const existing = new Set(build.classes.map((c) => c.classKey));
  const candidates = [
    ...build.classes.map((c) => c.classKey),
    ...(rules.multiclassAllowed || current === 0 ? content.byKind('class').map((c) => c.key).filter((k) => !existing.has(k)) : []),
  ];

  const classes: LevelUpClassOption[] = [];
  for (const key of candidates) {
    const cls = content.getOf(key, 'class');
    if (!cls) continue;
    const isNew = !existing.has(key);
    const cur = build.levels.filter((l) => l.classKey === key).length;
    const next = cur + 1;
    let available = canLevelUp && next <= 20;
    let why: string | undefined;
    if (isNew && current > 0) {
      const reqs = [cls, ...build.classes.map((c) => content.getOf(c.classKey, 'class')).filter((x) => !!x)];
      for (const r of reqs) {
        if (!meetsMulticlass(r!.data.multiclassRequirement, scores)) {
          available = false;
          why = `${r!.nameRu}: нужно ${describeRequirement(r!.data.multiclassRequirement)}`;
          break;
        }
      }
    }
    const subclassKey = build.classes.find((c) => c.classKey === key)?.subclassKey;
    const sub = subclassKey ? content.getOf(subclassKey, 'subclass') : undefined;
    const features = [
      ...cls.data.features.filter((f) => (f.level ?? 1) === next && !f.hidden),
      ...(sub?.data.features.filter((f) => (f.level ?? cls.data.subclassLevel) === next && !f.hidden) ?? []),
    ].map((f) => ({ key: f.key, nameRu: f.nameRu, textMd: f.textMd }));
    classes.push({
      classKey: key,
      nameRu: cls.nameRu,
      isNew,
      currentLevel: cur,
      newLevel: next,
      available,
      reasonRu: why ?? (available ? undefined : reasonRu),
      hitDie: cls.data.hitDie,
      hpAverage: cls.data.hitDie / 2 + 1,
      features,
      needsSubclass: next >= cls.data.subclassLevel && !subclassKey,
      subclasses: content
        .byKind('subclass')
        .filter((s) => s.data.classKey === key)
        .map((s) => ({ key: s.key, nameRu: s.nameRu })),
      asi: cls.data.asiLevels.includes(next),
      spells: classSpellInfo(content, key, subclassKey, cur, next),
    });
  }
  return { currentLevel: current, nextLevel, canLevelUp, reasonRu, hpMethods, classes, featsAllowed: rules.featsAllowed };
}

/** Применение решения мастера повышения: новая сборка (SPEC §10). */
export function applyLevelUp(
  build: CharacterBuild,
  decision: LevelUpDecision,
  content: ContentIndex,
  rules: CampaignSettings,
): CharacterBuild {
  const opts = levelUpOptions(build, content, rules);
  const opt = opts.classes.find((c) => c.classKey === decision.classKey);
  if (!opt) throw new CommandError('class_unavailable', 'Класс недоступен для повышения.');
  if (!opt.available) throw new CommandError('class_unavailable', opt.reasonRu ?? 'Класс недоступен для повышения.');
  const first = build.levels.length === 0;
  let hp = decision.hp;
  if (first) hp = { method: 'max' };
  else {
    if (hp.method === 'max') throw new CommandError('hp_method', 'Максимум хитов допустим только на 1 уровне.');
    if (!opts.hpMethods.includes(hp.method)) throw new CommandError('hp_method', 'Способ определения хитов не разрешён мастером.');
    if (hp.method === 'roll' && (hp.roll === undefined || hp.roll < 1 || hp.roll > opt.hitDie)) {
      throw new CommandError('hp_roll', `Бросок хитов должен быть от 1 до ${opt.hitDie}.`);
    }
  }
  if (decision.asi && !opt.asi) throw new CommandError('asi_level', 'На этом уровне нет увеличения характеристик.');
  if (decision.asi?.kind === 'asi') {
    const sum = Object.values(decision.asi.increases).reduce((s, v) => s + (v ?? 0), 0);
    if (sum !== 2) throw new CommandError('asi_sum', 'Нужно распределить ровно 2 очка.');
  }
  if (decision.asi?.kind === 'feat' && !rules.featsAllowed) throw new CommandError('feats_disabled', 'Черты запрещены мастером.');

  const next: CharacterBuild = clone(build);
  if (opt.isNew) next.classes.push({ classKey: decision.classKey });
  const entry = next.classes.find((c) => c.classKey === decision.classKey)!;
  if (decision.subclassKey) {
    const sc = content.getOf(decision.subclassKey, 'subclass');
    if (!sc || sc.data.classKey !== decision.classKey) throw new CommandError('subclass', 'Подкласс не подходит классу.');
    entry.subclassKey = decision.subclassKey;
  }
  next.levels.push({ classKey: decision.classKey, hp: { ...hp }, ...(decision.asi ? { asi: decision.asi } : {}) });
  for (const [k, v] of Object.entries(decision.choices ?? {})) next.choices[k] = [...v];

  const sp = decision.spells;
  if (sp) {
    let ks = next.knownSpells.find((k) => k.classKey === decision.classKey);
    if (!ks) {
      ks = { classKey: decision.classKey, cantrips: [], spells: [] };
      next.knownSpells.push(ks);
    }
    const addUniq = (arr: string[], add: string[] | undefined) => {
      for (const k of add ?? []) if (!arr.includes(k)) arr.push(k);
    };
    addUniq(ks.cantrips, sp.cantrips);
    if (sp.replace) {
      const i = ks.spells.indexOf(sp.replace.from);
      if (i >= 0) ks.spells[i] = sp.replace.to;
    }
    addUniq(ks.spells, sp.spells);
    if (sp.spellbook?.length) {
      ks.spellbook ??= [];
      addUniq(ks.spellbook, sp.spellbook);
    }
  }
  return next;
}

/**
 * Отмена последнего повышения: удаляет последнюю запись `levels`; если класс больше не
 * представлен — убирает класс; с контентом — ещё подкласс ниже уровня получения и
 * выборы, ставшие недействительными.
 */
export function undoLastLevel(build: CharacterBuild, content?: ContentIndex, rules?: CampaignSettings): CharacterBuild {
  if (!build.levels.length) return build;
  const next: CharacterBuild = clone(build);
  const removed = next.levels.pop()!;
  const left = next.levels.filter((l) => l.classKey === removed.classKey).length;
  if (left === 0) {
    next.classes = next.classes.filter((c) => c.classKey !== removed.classKey);
    next.knownSpells = next.knownSpells.filter((k) => k.classKey !== removed.classKey);
  } else if (content) {
    const cls = content.getOf(removed.classKey, 'class');
    const entry = next.classes.find((c) => c.classKey === removed.classKey);
    if (cls && entry?.subclassKey && left < cls.data.subclassLevel) delete entry.subclassKey;
  }
  if (content && rules) {
    const { sheet } = computeWithPipeline(next, emptyState(), content, rules);
    const valid = new Set(sheet.choices.filter((c) => c.kind === 'choice').map((c) => c.key));
    for (const k of Object.keys(next.choices)) if (!valid.has(k)) delete next.choices[k];
    for (const c of sheet.spellcasting.classes) {
      const ks = next.knownSpells.find((k) => k.classKey === c.classKey);
      if (!ks) continue;
      if (c.cantripsMax !== undefined) ks.cantrips = ks.cantrips.slice(0, c.cantripsMax);
      if (c.knownMax !== undefined) ks.spells = ks.spells.slice(0, c.knownMax);
    }
  }
  return next;
}
