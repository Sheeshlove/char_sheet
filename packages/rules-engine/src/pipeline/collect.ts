import type {
  ChoiceSource,
  ClassData,
  ConditionId,
  Effect,
  EffectOf,
  Feature,
  ProfTarget,
} from '@ps/content-schema';
import { ABILITIES, SKILLS } from '@ps/content-schema';
import { CONDITION_EFFECTS, exhaustionEffects } from '../tables/conditions';
import { ABILITY_LABEL_RU } from '../tables/abilities';
import { maxSpellLevelFor } from '../tables/spell-slots';
import { CONDITION_LABEL_RU, SKILL_LABEL_RU } from '../tables/labels';
import type { ChoiceOption } from '../types';
import { choiceKey, type Equipment, type Pipeline, type Source, type SourceCtx, type WieldedWeapon } from './context';

const MAX_DEPTH = 8;

// ─── Стадия 1а. Уровни ────────────────────────────────────────────────────

export function collectLevels(p: Pipeline): void {
  for (const lvl of p.build.levels) {
    p.classLevels.set(lvl.classKey, (p.classLevels.get(lvl.classKey) ?? 0) + 1);
  }
  p.totalLevel = p.build.levels.length;
  for (const c of p.build.classes) {
    if (c.subclassKey) p.subclassOf.set(c.classKey, c.subclassKey);
    if (!p.classLevels.has(c.classKey)) p.classLevels.set(c.classKey, 0);
  }
}

// ─── Стадия 1б. Снаряжение ────────────────────────────────────────────────

function sumBonus(effects: Effect[], targets: string[]): number {
  let s = 0;
  for (const e of effects) {
    if (e.type === 'bonus' && !e.when && targets.includes(e.target)) {
      const n = Number(e.value);
      if (Number.isFinite(n)) s += n;
    }
  }
  return s;
}

/** Бонусы, которые являются «магическим бонусом» самого предмета, а не общими эффектами. */
function isLocalBonus(e: Effect, local: string[]): boolean {
  return e.type === 'bonus' && !e.when && local.includes(e.target) && Number.isFinite(Number(e.value));
}

export function collectEquipment(p: Pipeline): Equipment {
  const eq: Equipment = { body: [], shields: [], weapons: [], activeItems: [], armorCategory: 'none', hasShield: false };
  for (const item of p.state.inventory) {
    if (!item.equipped || item.qty <= 0 || !item.key) continue;
    const entity = p.content.get(item.key);
    if (!entity) continue;
    const nameRu = item.customName || entity.nameRu;
    if (entity.kind === 'armor') {
      const w = { itemId: item.id, nameRu, data: entity.data, magicBonus: 0, entityKey: entity.key };
      (entity.data.category === 'shield' ? eq.shields : eq.body).push(w);
    } else if (entity.kind === 'weapon') {
      eq.weapons.push({
        itemId: item.id,
        nameRu,
        data: entity.data,
        magicBonus: 0,
        magicDamageBonus: 0,
        hand: item.hand ?? 'main',
        entityKey: entity.key,
        baseSlug: entity.slug,
      });
    } else if (entity.kind === 'item') {
      const data = entity.data;
      const active = data.attunement === false || item.attuned;
      const baseKey = typeof data.baseItem === 'string' ? data.baseItem : item.baseKey;
      const base = p.content.get(baseKey);
      if (active) eq.activeItems.push({ item, entity });
      if (base?.kind === 'armor') {
        const w = {
          itemId: item.id,
          nameRu,
          data: base.data,
          magicBonus: active ? sumBonus(data.effects, ['ac']) : 0,
          entityKey: entity.key,
        };
        (base.data.category === 'shield' ? eq.shields : eq.body).push(w);
      } else if (base?.kind === 'weapon') {
        const range = base.data.range === 'ranged' ? 'ranged_weapon' : 'melee_weapon';
        eq.weapons.push({
          itemId: item.id,
          nameRu,
          data: base.data,
          magicBonus: active ? sumBonus(data.effects, [`attack:${range}`]) : 0,
          magicDamageBonus: active ? sumBonus(data.effects, [`damage:${range}`]) : 0,
          hand: item.hand ?? 'main',
          entityKey: entity.key,
          baseSlug: base.slug,
        });
      }
    }
  }
  eq.armorCategory = (eq.body[0]?.data.category as Equipment['armorCategory'] | undefined) ?? 'none';
  eq.hasShield = eq.shields.length > 0;
  return eq;
}

/**
 * Локальные бонусы надетого магического доспеха/оружия уже учтены в `magicBonus`.
 * RULES-NOTE: безусловные бонусы атаки/урона/КД магического предмета относятся только к нему.
 */
function itemGlobalEffects(p: Pipeline, entityKey: string, effects: Effect[]): Effect[] {
  const e = p.content.getOf(entityKey, 'item');
  const baseKey = e && typeof e.data.baseItem === 'string' ? e.data.baseItem : undefined;
  const itemType = e?.data.itemType;
  const base = p.content.get(baseKey);
  let local: string[] = [];
  if (itemType === 'armor' || itemType === 'shield' || base?.kind === 'armor') local = ['ac'];
  if (itemType === 'weapon' || base?.kind === 'weapon') {
    local = ['attack:melee_weapon', 'attack:ranged_weapon', 'damage:melee_weapon', 'damage:ranged_weapon'];
  }
  return effects.filter((x) => !isLocalBonus(x, local));
}

// ─── Стадия 1в. Источники ─────────────────────────────────────────────────

export function addSource(p: Pipeline, source: Source, depth = 0): boolean {
  if (p.sources.some((s) => s.sourceKey === source.sourceKey)) return false;
  p.sources.push(source);
  for (const f of source.features) {
    const src: SourceCtx = {
      sourceKey: source.sourceKey,
      sourceLabelRu: source.sourceLabelRu,
      featureKey: f.key,
      featureNameRu: f.nameRu,
      classKey: source.classKey,
      level: f.level,
    };
    expandEffects(p, f.effects, src, depth);
  }
  return true;
}

export function expandEffects(p: Pipeline, effects: Effect[], src: SourceCtx, depth: number): void {
  if (depth > MAX_DEPTH) return;
  for (const e of effects) {
    if (e.type === 'choice') {
      if (!p.check(e.when, src)) continue;
      expandChoice(p, e, src, depth);
      continue;
    }
    if (e.type === 'toggle') {
      if (!p.toggleDefs.some((t) => t.effect.id === e.id)) p.toggleDefs.push({ effect: e, src });
      if (p.state.toggles.includes(e.id) && p.check(e.when, src)) expandEffects(p, e.effects, src, depth + 1);
      continue;
    }
    p.pushEffect(e, src);
  }
}

function weaponProfLabel(p: Pipeline, slug: string): string {
  if (slug === 'simple') return 'Простое оружие';
  if (slug === 'martial') return 'Воинское оружие';
  return p.content.bySlug('weapon', slug)?.nameRu ?? slug;
}

export function choiceOptions(p: Pipeline, source: ChoiceSource, src?: SourceCtx): ChoiceOption[] {
  switch (source.kind) {
    case 'list':
      return source.items.map((i) => ({ value: i.value, labelRu: i.labelRu }));
    case 'skills':
      return [
        ...(source.from === 'any' ? [...SKILLS] : source.from).map((s) => ({ value: s, labelRu: SKILL_LABEL_RU[s] })),
        ...(source.tools ?? []).map((t) => ({ value: `tool:${t}`, labelRu: p.content.bySlug('tool', t)?.nameRu ?? t })),
      ];
    case 'languages': {
      const langs = p.content.byKind('language').map((l) => ({ value: l.slug, labelRu: l.nameRu }));
      const custom = p.rules.customLanguages.map((l) => ({ value: `custom:${l}`, labelRu: l }));
      return [...langs, ...custom];
    }
    case 'tools':
      return p.content
        .byKind('tool')
        .filter((t) => !source.group || source.group === 'any' || t.data.toolGroup === source.group)
        .map((t) => ({ value: t.slug, labelRu: t.nameRu }));
    case 'ability_increase':
      return (source.abilities ?? [...ABILITIES]).map((a) => ({ value: a, labelRu: ABILITY_LABEL_RU[a] }));
    case 'feat':
      return p.content.byKind('feat').map((f) => ({ value: f.key, labelRu: f.nameRu }));
    case 'spells': {
      const levelOk = spellLevelFilter(p, source.level, src);
      const pool = source.list === '*' ? p.content.byKind('spell') : p.content.spellList(source.list).map((k) => p.content.getOf(k, 'spell'));
      return pool
        .filter((s) => !!s && levelOk(s.data.level) && (!source.school || source.school.includes(s.data.school)))
        .map((s) => ({ value: s!.key, labelRu: s!.nameRu }));
    }
    case 'fighting_style':
      return source.styles.map((k) => ({ value: k, labelRu: p.content.get(k)?.nameRu ?? k }));
  }
}

/** Фильтр круга для выбора заклинаний; `up_to_max` — заговоры и круги, доступные классу-источнику. */
function spellLevelFilter(p: Pipeline, level: number | 'cantrip' | 'up_to_max', src?: SourceCtx): (l: number) => boolean {
  if (level === 'cantrip') return (l) => l === 0;
  if (level !== 'up_to_max') return (l) => l === level;
  const cls = src?.classKey ? p.content.getOf(src.classKey, 'class') : undefined;
  const subKey = src?.classKey ? p.subclassOf.get(src.classKey) : undefined;
  const sc = cls?.data.spellcasting ?? (subKey ? p.content.getOf(subKey, 'subclass')?.data.spellcasting : undefined);
  const max = sc ? maxSpellLevelFor(sc.progression, p.classLevel(src!.classKey)) : 0;
  return (l) => l <= max;
}

function expandChoice(p: Pipeline, e: EffectOf<'choice'>, src: SourceCtx, depth: number) {
  const key = choiceKey(src, e.id);
  if (p.choices.some((c) => c.key === key)) return;
  const opts = e.options;
  const required = opts.kind === 'ability_increase' ? opts.points : Math.max(0, Math.floor(p.num(e.choose, src)));
  const options = choiceOptions(p, opts, src);
  const values = new Set(options.map((o) => o.value));
  const raw = p.build.choices[key] ?? [];
  const selected: string[] = [];
  const perAbility = new Map<string, number>();
  for (const v of raw) {
    if (selected.length >= required) break;
    if (!values.has(v)) {
      p.issues.push({ severity: 'warning', code: 'choice_invalid', messageRu: `${e.labelRu}: недопустимый вариант «${v}»`, path: `choices.${key}` });
      continue;
    }
    if (opts.kind === 'ability_increase') {
      const n = (perAbility.get(v) ?? 0) + 1;
      if (n > opts.maxPerAbility) continue;
      perAbility.set(v, n);
    } else if (selected.includes(v)) continue;
    selected.push(v);
  }
  p.choices.push({
    key,
    kind: 'choice',
    labelRu: e.labelRu,
    sourceKey: src.sourceKey,
    sourceLabelRu: src.featureNameRu ? `${src.sourceLabelRu}: ${src.featureNameRu}` : src.sourceLabelRu,
    featureKey: src.featureKey,
    choose: required,
    selected,
    source: opts,
    options,
    classKey: src.classKey,
  });

  switch (opts.kind) {
    case 'list':
      for (const v of selected) {
        const item = opts.items.find((i) => i.value === v);
        if (item) expandEffects(p, item.effects, src, depth + 1);
      }
      break;
    case 'skills':
      for (const v of selected) {
        const target = (v.startsWith('tool:') ? v : `skill:${v}`) as ProfTarget;
        p.pushEffect({ type: 'proficiency', target, level: opts.grant }, src);
      }
      break;
    case 'languages':
      for (const v of selected) {
        if (v.startsWith('custom:')) p.customLanguages.add(v.slice(7));
        else p.pushEffect({ type: 'proficiency', target: `language:${v}` as ProfTarget, level: 'proficient' }, src);
      }
      break;
    case 'tools':
      for (const v of selected) p.pushEffect({ type: 'proficiency', target: `tool:${v}` as ProfTarget, level: 'proficient' }, src);
      break;
    case 'ability_increase':
      for (const [a, n] of perAbility) {
        p.pushEffect({ type: 'ability', ability: a as (typeof ABILITIES)[number], op: 'add', value: String(n) }, src);
      }
      break;
    case 'feat':
      for (const v of selected) addFeatSource(p, v, depth + 1);
      break;
    case 'spells':
      p.choiceSelections.set(key, selected);
      break;
    case 'fighting_style':
      for (const v of selected) {
        const ent = p.content.getOf(v, 'feature');
        if (ent) {
          addSource(
            p,
            { sourceKey: ent.key, sourceLabelRu: ent.nameRu, kind: 'feature', classKey: src.classKey, features: ent.data.features },
            depth + 1,
          );
        }
      }
      break;
  }
}

export function addFeatSource(p: Pipeline, featKey: string, depth: number): void {
  const feat = p.content.getOf(featKey, 'feat');
  if (!feat) {
    p.issues.push({ severity: 'warning', code: 'content_missing', messageRu: `Черта не найдена: ${featKey}` });
    return;
  }
  let sourceKey = feat.key;
  if (p.sources.some((s) => s.sourceKey === sourceKey)) {
    if (!feat.data.repeatable) return;
    let n = 2;
    while (p.sources.some((s) => s.sourceKey === `${feat.key}~${n}`)) n++;
    sourceKey = `${feat.key}~${n}`;
  }
  addSource(p, { sourceKey, sourceLabelRu: feat.nameRu, kind: 'feat', features: feat.data.features }, depth);
}

function weaponTarget(w: string): ProfTarget {
  return `weapon:${w}` as ProfTarget;
}

/** Структурированные владения класса → синтетическое умение (SPEC §8.4 п. 5). */
export function classProficiencyFeature(p: Pipeline, cls: ClassData, isFirst: boolean): Feature {
  const effects: Effect[] = [];
  const profs = isFirst ? cls.proficiencies : cls.multiclassProficiencies;
  if (isFirst) {
    for (const a of cls.savingThrows) effects.push({ type: 'proficiency', target: `save:${a}`, level: 'proficient' });
  }
  for (const a of profs.armor) effects.push({ type: 'proficiency', target: `armor:${a}`, level: 'proficient' });
  for (const w of profs.weapons) effects.push({ type: 'proficiency', target: weaponTarget(w), level: 'proficient' });
  let toolChoice = 0;
  for (const t of profs.tools) {
    const m = /^choice:(\d+):(\w+)$/.exec(t);
    if (m) {
      toolChoice++;
      effects.push({
        type: 'choice',
        id: `tools-${toolChoice}`,
        labelRu: 'Владение инструментами',
        choose: Number(m[1]),
        options: { kind: 'tools', group: m[2] as 'artisan' | 'musical' | 'gaming' | 'any' },
      });
    } else effects.push({ type: 'proficiency', target: `tool:${t}` as ProfTarget, level: 'proficient' });
  }
  const skills = isFirst ? cls.proficiencies.skills : cls.multiclassProficiencies.skills;
  if (skills && skills.choose > 0) {
    const from = skills.from === 'class_list' ? cls.proficiencies.skills.from : skills.from;
    effects.push({
      type: 'choice',
      id: 'skills',
      labelRu: 'Навыки класса',
      choose: skills.choose,
      options: { kind: 'skills', from, grant: 'proficient' },
    });
  }
  return {
    key: 'proficiencies',
    nameRu: 'Владения',
    textMd: '',
    effects,
    effectsStatus: 'complete',
    hidden: true,
  };
}

export { weaponProfLabel };

export function collectSources(p: Pipeline): void {
  const { build, content } = p;
  // Раса и подраса
  const race = content.getOf(build.race, 'race');
  if (build.race && !race) p.issues.push({ severity: 'warning', code: 'content_missing', messageRu: `Раса не найдена: ${build.race}` });
  if (race) addSource(p, { sourceKey: race.key, sourceLabelRu: race.nameRu, kind: 'race', features: race.data.features });
  const sub = content.getOf(build.subrace, 'subrace');
  if (build.subrace && !sub) p.issues.push({ severity: 'warning', code: 'content_missing', messageRu: `Подраса не найдена: ${build.subrace}` });
  if (sub) addSource(p, { sourceKey: sub.key, sourceLabelRu: sub.nameRu, kind: 'subrace', features: sub.data.features });

  // Предыстория
  const bg = content.getOf(build.background, 'background');
  if (build.background && !bg) {
    p.issues.push({ severity: 'warning', code: 'content_missing', messageRu: `Предыстория не найдена: ${build.background}` });
  }
  if (bg) {
    const effects: Effect[] = [];
    if (Array.isArray(bg.data.skills)) {
      for (const s of bg.data.skills) effects.push({ type: 'proficiency', target: `skill:${s}`, level: 'proficient' });
    } else {
      effects.push({
        type: 'choice',
        id: 'skills',
        labelRu: 'Навыки предыстории',
        choose: bg.data.skills.choose,
        options: { kind: 'skills', from: bg.data.skills.from, grant: 'proficient' },
      });
    }
    let tc = 0;
    for (const t of bg.data.tools) {
      const m = /^choice:(\d+):(\w+)$/.exec(t);
      if (m) {
        tc++;
        effects.push({
          type: 'choice',
          id: `tools-${tc}`,
          labelRu: 'Инструменты предыстории',
          choose: Number(m[1]),
          options: { kind: 'tools', group: m[2] as 'artisan' },
        });
      } else effects.push({ type: 'proficiency', target: `tool:${t}` as ProfTarget, level: 'proficient' });
    }
    if (Array.isArray(bg.data.languages)) {
      for (const l of bg.data.languages) effects.push({ type: 'proficiency', target: `language:${l}` as ProfTarget, level: 'proficient' });
    } else if (bg.data.languages.choose > 0) {
      effects.push({
        type: 'choice',
        id: 'languages',
        labelRu: 'Языки предыстории',
        choose: bg.data.languages.choose,
        options: { kind: 'languages' },
      });
    }
    addSource(p, {
      sourceKey: bg.key,
      sourceLabelRu: bg.nameRu,
      kind: 'background',
      features: [
        { key: 'proficiencies', nameRu: 'Владения', textMd: '', effects, effectsStatus: 'complete', hidden: true },
        bg.data.feature,
      ],
    });
  }

  // Классы и подклассы
  build.classes.forEach((c, idx) => {
    const cls = content.getOf(c.classKey, 'class');
    if (!cls) {
      p.issues.push({ severity: 'warning', code: 'content_missing', messageRu: `Класс не найден: ${c.classKey}` });
      return;
    }
    const lvl = p.classLevel(c.classKey);
    if (lvl <= 0) return;
    const features = [
      classProficiencyFeature(p, cls.data, idx === 0),
      ...cls.data.features.filter((f) => (f.level ?? 1) <= lvl),
    ];
    addSource(p, { sourceKey: cls.key, sourceLabelRu: cls.nameRu, kind: 'class', classKey: cls.key, features });
    if (c.subclassKey) {
      const sc = content.getOf(c.subclassKey, 'subclass');
      if (!sc) {
        p.issues.push({ severity: 'warning', code: 'content_missing', messageRu: `Подкласс не найден: ${c.subclassKey}` });
      } else {
        addSource(p, {
          sourceKey: sc.key,
          sourceLabelRu: sc.nameRu,
          kind: 'subclass',
          classKey: cls.key,
          features: sc.data.features.filter((f) => (f.level ?? cls.data.subclassLevel) <= lvl),
        });
      }
    }
  });

  // Увеличение характеристик и черты из уровней
  const running = new Map<string, number>();
  build.levels.forEach((lvl, i) => {
    const n = (running.get(lvl.classKey) ?? 0) + 1;
    running.set(lvl.classKey, n);
    if (!lvl.asi) return;
    if (lvl.asi.kind === 'asi') {
      const src: SourceCtx = {
        sourceKey: `asi:${i}`,
        sourceLabelRu: `Увеличение характеристик (${i + 1} ур.)`,
        featureKey: 'asi',
      };
      for (const a of ABILITIES) {
        const v = lvl.asi.increases[a];
        if (v) p.pushEffect({ type: 'ability', ability: a, op: 'add', value: String(v) }, src);
      }
    } else {
      addFeatSource(p, lvl.asi.featKey, 0);
    }
  });

  // Предметы
  for (const { entity } of p.equipment.activeItems) {
    addSource(p, {
      sourceKey: entity.key,
      sourceLabelRu: entity.nameRu,
      kind: 'item',
      features: [
        {
          key: 'item',
          nameRu: entity.nameRu,
          textMd: '',
          effects: itemGlobalEffects(p, entity.key, entity.data.effects),
          effectsStatus: entity.data.effectsStatus,
        },
      ],
    });
  }

  // Состояния и истощение
  const conds = new Set<ConditionId>();
  const addCond = (c: ConditionId) => {
    if (conds.has(c) || c === 'exhaustion') return;
    conds.add(c);
    const ent = content.getOf(`srd/condition/${c}`, 'condition');
    for (const imp of ent?.data.implies ?? CONDITION_EFFECTS[c]?.implies ?? []) addCond(imp as ConditionId);
  };
  for (const c of p.state.conditions) addCond(c);
  p.activeConditions = [...conds];
  for (const c of conds) {
    const ent = content.getOf(`srd/condition/${c}`, 'condition');
    const effects = ent?.data.effects ?? CONDITION_EFFECTS[c as Exclude<ConditionId, 'exhaustion'>]?.effects ?? [];
    addSource(p, {
      sourceKey: `srd/condition/${c}`,
      sourceLabelRu: ent?.nameRu ?? CONDITION_LABEL_RU[c],
      kind: 'condition',
      hiddenInList: true,
      features: [{ key: c, nameRu: CONDITION_LABEL_RU[c], textMd: '', effects, effectsStatus: 'complete' }],
    });
  }
  const ex = p.state.exhaustion;
  if (ex > 0) {
    addSource(p, {
      sourceKey: 'srd/condition/exhaustion',
      sourceLabelRu: `${CONDITION_LABEL_RU.exhaustion} ${ex}`,
      kind: 'condition',
      hiddenInList: true,
      features: [{ key: 'exhaustion', nameRu: 'Истощение', textMd: '', effects: exhaustionEffects(ex), effectsStatus: 'complete' }],
    });
  }

  // Ручные эффекты
  for (const m of build.manualEffects) {
    if (!m.enabled) continue;
    addSource(p, {
      sourceKey: `manual:${m.id}`,
      sourceLabelRu: m.labelRu,
      kind: 'manual',
      features: [{ key: m.id, nameRu: m.labelRu, textMd: '', effects: m.effects, effectsStatus: 'complete' }],
    });
  }
}

/** Переключатели «заклинание действует» для известных заклинаний с `selfEffects`. */
export function collectSpellToggles(p: Pipeline, spellKeys: Iterable<string>): void {
  const seen = new Set<string>();
  for (const key of spellKeys) {
    if (seen.has(key)) continue;
    seen.add(key);
    const spell = p.content.getOf(key, 'spell');
    if (!spell?.data.selfEffects?.length) continue;
    const toggle: EffectOf<'toggle'> = {
      type: 'toggle',
      id: `spell:${key}`,
      labelRu: spell.nameRu,
      effects: spell.data.selfEffects,
    };
    const src: SourceCtx = { sourceKey: key, sourceLabelRu: spell.nameRu, featureKey: 'self' };
    expandEffects(p, [toggle], src, 1);
  }
}

export function isWeaponProficient(profs: Set<string>, w: WieldedWeapon): boolean {
  return (
    profs.has(`weapon:${w.data.category}`) ||
    (w.baseSlug !== undefined && profs.has(`weapon:${w.baseSlug}`))
  );
}
