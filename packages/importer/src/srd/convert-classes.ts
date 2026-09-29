import type {
  Ability,
  ClassData,
  ClassSpellcasting,
  ContentEntity,
  Effect,
  EquipmentChoiceGroup,
  Feature,
  SkillId,
  SubclassData,
} from '@ps/content-schema';
import { paragraphs } from '../util/text';
import type { Translator } from './dict';
import { key, type EquipmentIndex } from './convert-equipment';
import type { Choice, Option, SrdData, SrdFeature, SrdLevel, SrdProficiency } from './types';

// ─── Владения ─────────────────────────────────────────────────────────────

export type ProfIndex = Map<string, SrdProficiency>;

export function profIndex(list: SrdProficiency[]): ProfIndex {
  return new Map(list.map((p) => [p.index, p]));
}

export const skillFromProf = (idx: string): SkillId | null =>
  idx.startsWith('skill-') ? (idx.slice(6).replace(/-/g, '_') as SkillId) : null;

/** Индекс владения 5e-database → цели владения движка. */
export function profTargets(idx: string, profs: ProfIndex): string[] {
  const skill = skillFromProf(idx);
  if (skill) return [`skill:${skill}`];
  const st = /^saving-throw-(str|dex|con|int|wis|cha)$/.exec(idx);
  if (st) return [`save:${st[1]}`];
  switch (idx) {
    case 'light-armor':
      return ['armor:light'];
    case 'medium-armor':
      return ['armor:medium'];
    case 'heavy-armor':
      return ['armor:heavy'];
    case 'all-armor':
      return ['armor:light', 'armor:medium', 'armor:heavy'];
    case 'shields':
      return ['armor:shield'];
    case 'simple-weapons':
      return ['weapon:simple'];
    case 'martial-weapons':
      return ['weapon:martial'];
  }
  const p = profs.get(idx);
  if (!p) return [];
  if (p.type === 'Weapons') return [`weapon:${p.reference.index}`];
  if (p.type === 'Vehicles') return [`tool:${p.reference.index}`];
  if (/Tools|Instruments|Gaming/i.test(p.type) || p.type === 'Other') return [`tool:${p.reference.index}`];
  return [];
}

function armorWeaponTool(refs: { index: string }[], profs: ProfIndex) {
  const armor: ClassData['proficiencies']['armor'] = [];
  const weapons: string[] = [];
  const tools: string[] = [];
  for (const r of refs) {
    for (const t of profTargets(r.index, profs)) {
      const [k, v] = t.split(':') as [string, string];
      if (k === 'armor') armor.push(v as ClassData['proficiencies']['armor'][number]);
      else if (k === 'weapon') weapons.push(v);
      else if (k === 'tool') tools.push(v);
    }
  }
  return { armor, weapons, tools };
}

function optionRefs(c: Choice | undefined): string[] {
  return (c?.from.options ?? []).flatMap((o) => (o.option_type === 'reference' ? [o.item.index] : []));
}

/** Выбор инструментов «choice:N:group» по описанию выбора 5e-database. */
function toolChoice(c: Choice, profs: ProfIndex): string | null {
  const refs = optionRefs(c);
  const nested = (c.from.options ?? []).some((o) => o.option_type === 'choice');
  const desc = (c.desc ?? '').toLowerCase();
  const types = new Set(refs.map((r) => profs.get(r)?.type ?? ''));
  if (!refs.length && !nested) return null;
  if (refs.length && refs.every((r) => skillFromProf(r))) return null;
  let group = 'any';
  if (nested || (/artisan/.test(desc) && /musical|instrument/.test(desc))) group = 'any';
  else if (types.size === 1 && [...types][0]!.includes('Musical')) group = 'musical';
  else if (types.size === 1 && [...types][0]!.includes('Artisan')) group = 'artisan';
  else if (types.size === 1 && [...types][0]!.includes('Gaming')) group = 'gaming';
  return `choice:${c.choose}:${group}`;
}

// ─── Справочник классов (SPEC §8.12) ─────────────────────────────────────

const SPELLCASTING: Record<string, Omit<ClassSpellcasting, 'cantripsKnown' | 'spellsKnown'>> = {
  bard: { ability: 'cha', progression: 'full', preparation: 'known', spellListKey: 'bard', ritualCasting: 'prepared_only' },
  cleric: {
    ability: 'wis',
    progression: 'full',
    preparation: 'prepared',
    spellListKey: 'cleric',
    preparedFormula: 'max(1, CLASS_LEVEL + WIS)',
    ritualCasting: 'prepared_only',
  },
  druid: {
    ability: 'wis',
    progression: 'full',
    preparation: 'prepared',
    spellListKey: 'druid',
    preparedFormula: 'max(1, CLASS_LEVEL + WIS)',
    ritualCasting: 'prepared_only',
  },
  paladin: {
    ability: 'cha',
    progression: 'half',
    preparation: 'prepared',
    spellListKey: 'paladin',
    preparedFormula: 'max(1, floor(CLASS_LEVEL / 2) + CHA)',
    ritualCasting: 'none',
  },
  ranger: { ability: 'wis', progression: 'half', preparation: 'known', spellListKey: 'ranger', ritualCasting: 'none' },
  sorcerer: { ability: 'cha', progression: 'full', preparation: 'known', spellListKey: 'sorcerer', ritualCasting: 'none' },
  warlock: { ability: 'cha', progression: 'pact', preparation: 'known', spellListKey: 'warlock', ritualCasting: 'none' },
  wizard: {
    ability: 'int',
    progression: 'full',
    preparation: 'spellbook',
    spellListKey: 'wizard',
    preparedFormula: 'max(1, CLASS_LEVEL + INT)',
    ritualCasting: 'from_book',
  },
};

const SUBCLASS_LEVEL: Record<string, number> = {
  barbarian: 3,
  bard: 3,
  cleric: 1,
  druid: 2,
  fighter: 3,
  monk: 3,
  paladin: 3,
  ranger: 3,
  rogue: 3,
  sorcerer: 1,
  warlock: 1,
  wizard: 2,
};

const SUBCLASS_LABEL: Record<string, string> = {
  barbarian: 'Путь дикости',
  bard: 'Коллегия бардов',
  cleric: 'Божественный домен',
  druid: 'Круг друидов',
  fighter: 'Воинский архетип',
  monk: 'Монастырская традиция',
  paladin: 'Священная клятва',
  ranger: 'Архетип следопыта',
  rogue: 'Плутовской архетип',
  sorcerer: 'Происхождение чародея',
  warlock: 'Потусторонний покровитель',
  wizard: 'Магическая традиция',
};

const STARTING_GOLD: Record<string, string> = {
  barbarian: '2d4*10',
  bard: '5d4*10',
  cleric: '5d4*10',
  druid: '2d4*10',
  fighter: '5d4*10',
  monk: '5d4',
  paladin: '5d4*10',
  ranger: '5d4*10',
  rogue: '4d4*10',
  sorcerer: '3d4*10',
  warlock: '4d4*10',
  wizard: '4d4*10',
};

/** Колонки таблицы класса: ключи совпадают с выражениями `col()` в оверлеях. */
const COLUMN: Record<string, { key: string; labelRu: string }> = {
  rage_count: { key: 'rages', labelRu: 'Ярость' },
  rage_damage_bonus: { key: 'rage_damage', labelRu: 'Урон ярости' },
  brutal_critical_dice: { key: 'brutal_critical', labelRu: 'Сильный критический удар' },
  bardic_inspiration_die: { key: 'bardic_inspiration', labelRu: 'Кость вдохновения' },
  song_of_rest_die: { key: 'song_of_rest', labelRu: 'Песнь отдыха' },
  channel_divinity_charges: { key: 'channel_divinity', labelRu: 'Божественный канал' },
  destroy_undead_cr: { key: 'destroy_undead_cr', labelRu: 'Уничтожение нежити (ПО)' },
  wild_shape_max_cr: { key: 'wild_shape_cr', labelRu: 'Дикий облик (ПО)' },
  action_surges: { key: 'action_surges', labelRu: 'Всплеск действий' },
  indomitable_uses: { key: 'indomitable', labelRu: 'Упорный' },
  extra_attacks: { key: 'extra_attacks', labelRu: 'Доп. атаки' },
  martial_arts: { key: 'martial_arts', labelRu: 'Боевые искусства' },
  ki_points: { key: 'ki_points', labelRu: 'Очки ци' },
  unarmored_movement: { key: 'unarmored_movement', labelRu: 'Движение без доспехов' },
  aura_range: { key: 'aura_range', labelRu: 'Радиус ауры' },
  favored_enemies: { key: 'favored_enemies', labelRu: 'Избранные враги' },
  favored_terrain: { key: 'favored_terrain', labelRu: 'Избранная местность' },
  sneak_attack: { key: 'sneak_attack', labelRu: 'Скрытая атака' },
  sorcery_points: { key: 'sorcery_points', labelRu: 'Единицы чародейства' },
  metamagic_known: { key: 'metamagic_known', labelRu: 'Метамагия' },
  invocations_known: { key: 'invocations_known', labelRu: 'Известные воззвания' },
  arcane_recovery_levels: { key: 'arcane_recovery', labelRu: 'Магическое восстановление' },
};

function columnValue(k: string, v: unknown): string | number | null {
  if (v && typeof v === 'object' && 'dice_count' in (v as Record<string, unknown>)) {
    const o = v as { dice_count: number; dice_value: number };
    return `${o.dice_count}d${o.dice_value}`;
  }
  if (typeof v === 'number') {
    if (k === 'rage_count' && v >= 999) return '∞';
    if (k === 'bardic_inspiration_die' || k === 'song_of_rest_die') return v ? `1d${v}` : '—';
    return v;
  }
  if (typeof v === 'boolean') return v ? 'да' : 'нет';
  return null;
}

// ─── Умения ───────────────────────────────────────────────────────────────

const isAsi = (f: SrdFeature) => /ability-score-improvement/.test(f.index);
const isPlaceholder = (f: SrdFeature) => /-improvement(-\d+)?$/.test(f.index) && /feature$/i.test(f.name);

/** Ключ умения: индекс 5e-database без префикса класса (стабилен между импортами). */
export function featureKey(f: SrdFeature): string {
  const prefix = `${f.class.index}-`;
  return f.index.startsWith(prefix) ? f.index.slice(prefix.length) : f.index;
}

function effectsStatusOf(effects: Effect[]): Feature['effectsStatus'] {
  if (!effects.length) return 'text_only';
  const incomplete = effects.some(
    (e) =>
      e.type === 'text' ||
      (e.type === 'choice' && e.options.kind === 'list' && e.options.items.some((i) => i.effects.length === 0)),
  );
  return incomplete ? 'partial' : 'complete';
}

export function makeFeature(f: SrdFeature, byIndex: Map<string, SrdFeature>, tr: Translator): Feature {
  const effects: Effect[] = [];
  const fs = f.feature_specific;
  const sub = fs?.subfeature_options;
  if (sub) {
    const items = optionRefs(sub).map((idx) => {
      const child = byIndex.get(idx);
      const label = tr.t('features', idx, child?.name ?? idx).replace(/^[^:]+:\s*/, '');
      return { value: featureKey(child ?? ({ index: idx, class: f.class } as SrdFeature)), labelRu: label, effects: [] as Effect[] };
    });
    effects.push({ type: 'choice', id: 'option', labelRu: tr.t('features', f.index, f.name), choose: sub.choose, options: { kind: 'list', items } });
  }
  if (fs?.invocations?.length) {
    effects.push({
      type: 'choice',
      id: 'invocations',
      labelRu: 'Воззвания',
      choose: 'col("invocations_known")',
      replaceOnLevelUp: true,
      options: {
        kind: 'list',
        items: fs.invocations.map((r) => ({
          value: r.index.replace(/^eldritch-invocation-/, ''),
          labelRu: tr.t('features', r.index, r.name).replace(/^Воззвание:\s*/, ''),
          effects: [],
        })),
      },
    });
  }
  const exp = fs?.expertise_options;
  if (exp) {
    // 5e-database кодирует «два навыка или навык и воровские инструменты» как выбор 1 из вложенных
    // вариантов: число — максимум вложенных `choose`, инструменты — ссылки не на навыки.
    const chooses: number[] = [];
    const refs: string[] = [];
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>;
        if (typeof o.choose === 'number') chooses.push(o.choose);
        if (o.option_type === 'reference' && o.item && typeof o.item === 'object') refs.push(String((o.item as { index: string }).index));
        Object.values(o).forEach(walk);
      }
    };
    walk(exp);
    const tools = refs.filter((r) => !r.startsWith('skill-'));
    effects.push({
      type: 'choice',
      id: 'expertise',
      labelRu: 'Компетентность',
      choose: Math.max(...chooses),
      options: { kind: 'skills', from: 'any', grant: 'expertise', requireProficient: true, ...(tools.length ? { tools } : {}) },
    });
  }
  const hidden = isAsi(f) || isPlaceholder(f);
  return {
    key: featureKey(f),
    nameRu: isAsi(f) ? 'Увеличение характеристик' : isPlaceholder(f) ? 'Умение подкласса' : tr.t('features', f.index, f.name),
    nameEn: f.name,
    level: f.level,
    textMd: paragraphs(f.desc),
    effects,
    effectsStatus: effectsStatusOf(effects),
    ...(hidden ? { hidden: true } : {}),
  };
}

// ─── Снаряжение ───────────────────────────────────────────────────────────

function equipmentOption(o: Option, eq: EquipmentIndex): { key: string; qty: number }[] {
  switch (o.option_type) {
    case 'counted_reference':
      return [{ key: eq.get(o.of.index)?.key ?? key('gear', o.of.index), qty: o.count }];
    case 'reference':
      return [{ key: eq.get(o.item.index)?.key ?? key('gear', o.item.index), qty: 1 }];
    case 'multiple':
      return o.items.flatMap((i) => equipmentOption(i, eq));
    case 'choice':
      return o.choice.from.equipment_category ? [{ key: `any:${o.choice.from.equipment_category.index}`, qty: o.choice.choose }] : [];
    default:
      return [];
  }
}

export function startingEquipment(
  fixed: { equipment: { index: string }; quantity: number }[],
  options: Choice[] | undefined,
  eq: EquipmentIndex,
): EquipmentChoiceGroup[] {
  const groups: EquipmentChoiceGroup[] = [];
  for (const c of options ?? []) {
    if (c.from.option_set_type === 'equipment_category' && c.from.equipment_category) {
      groups.push({ options: [{ items: [{ key: `any:${c.from.equipment_category.index}`, qty: c.choose }] }] });
      continue;
    }
    const opts = (c.from.options ?? []).map((o) => ({ items: equipmentOption(o, eq) })).filter((o) => o.items.length);
    if (opts.length) groups.push({ options: opts });
  }
  if (fixed.length) {
    groups.push({ options: [{ items: fixed.map((f) => ({ key: eq.get(f.equipment.index)?.key ?? key('gear', f.equipment.index), qty: f.quantity })) }] });
  }
  return groups;
}

// ─── Классы ───────────────────────────────────────────────────────────────

export function convertClasses(src: SrdData, tr: Translator, eq: EquipmentIndex): ContentEntity[] {
  const profs = profIndex(src.proficiencies);
  const featuresByIndex = new Map(src.features.map((f) => [f.index, f]));
  const out: ContentEntity[] = [];

  for (const c of src.classes) {
    const lv: SrdLevel[] = src.levels.filter((l) => l.class.index === c.index && !l.subclass).sort((a, b) => a.level - b.level);
    const feats = src.features
      .filter((f) => f.class.index === c.index && !f.subclass && !f.parent)
      .sort((a, b) => a.level - b.level)
      .map((f) => makeFeature(f, featuresByIndex, tr));

    const saves = c.saving_throws.map((s) => s.index as Ability) as [Ability, Ability];
    const own = armorWeaponTool(c.proficiencies.filter((p) => !p.index.startsWith('saving-throw')), profs);
    let skills: ClassData['proficiencies']['skills'] = { choose: 0, from: [] };
    for (const pc of c.proficiency_choices) {
      const refs = optionRefs(pc);
      if (refs.length && refs.every((r) => skillFromProf(r))) {
        skills = { choose: pc.choose, from: refs.map((r) => skillFromProf(r)!) };
        if (skills.from.length === 18) skills = { choose: pc.choose, from: 'any' };
      } else {
        const t = toolChoice(pc, profs);
        if (t) own.tools.push(t);
      }
    }
    const mc = c.multi_classing;
    const mcProfs = armorWeaponTool(mc.proficiencies ?? [], profs);
    let mcSkills: ClassData['multiclassProficiencies']['skills'];
    for (const pc of mc.proficiency_choices ?? []) {
      const refs = optionRefs(pc);
      if (refs.length && refs.every((r) => skillFromProf(r))) {
        mcSkills = { choose: pc.choose, from: refs.length === 18 ? 'any' : 'class_list' };
      } else {
        const t = toolChoice(pc, profs);
        if (t) mcProfs.tools.push(t);
      }
    }
    const requirement: ClassData['multiclassRequirement'] = {};
    if (mc.prerequisites?.length) requirement.all = mc.prerequisites.map((p) => [p.ability_score.index as Ability, p.minimum_score]);
    if (mc.prerequisite_options) {
      requirement.any = (mc.prerequisite_options.from.options ?? []).flatMap((o) =>
        o.option_type === 'score_prerequisite' ? [[o.ability_score.index as Ability, o.minimum_score] as [Ability, number]] : [],
      );
    }

    // Колонки таблицы класса
    const colKeys = new Set<string>();
    for (const l of lv) for (const k of Object.keys(l.class_specific ?? {})) if (COLUMN[k]) colKeys.add(k);
    const columns = [...colKeys].map((k) => COLUMN[k]!);
    const hasCantrips = lv.some((l) => (l.spellcasting?.cantrips_known ?? 0) > 0);
    const hasKnown = lv.some((l) => (l.spellcasting?.spells_known ?? 0) > 0);
    if (hasCantrips) columns.push({ key: 'cantrips_known', labelRu: 'Известные заговоры' });
    if (hasKnown) columns.push({ key: 'spells_known', labelRu: 'Известные заклинания' });
    const maxSlot = Math.max(0, ...lv.flatMap((l) => Array.from({ length: 9 }, (_, i) => ((l.spellcasting?.[`spell_slots_level_${i + 1}`] ?? 0) > 0 ? i + 1 : 0))));
    for (let i = 1; i <= maxSlot; i++) columns.push({ key: `slots_${i}`, labelRu: `Ячейки ${i} круга` });

    const levels: ClassData['levels'] = Array.from({ length: 20 }, (_, i) => {
      const l = lv.find((x) => x.level === i + 1);
      const values: Record<string, string | number> = {};
      for (const k of colKeys) {
        const v = columnValue(k, l?.class_specific?.[k]);
        if (v !== null) values[COLUMN[k]!.key] = v;
      }
      if (hasCantrips) values.cantrips_known = l?.spellcasting?.cantrips_known ?? 0;
      if (hasKnown) values.spells_known = l?.spellcasting?.spells_known ?? 0;
      for (let s = 1; s <= maxSlot; s++) values[`slots_${s}`] = l?.spellcasting?.[`spell_slots_level_${s}`] ?? 0;
      return {
        level: i + 1,
        featureKeys: feats.filter((f) => f.level === i + 1 && !f.hidden).map((f) => f.key),
        values,
      };
    });
    const asiLevels = src.features
      .filter((f) => f.class.index === c.index && !f.subclass && isAsi(f))
      .map((f) => f.level)
      .sort((a, b) => a - b);

    const data: ClassData = {
      hitDie: c.hit_die,
      savingThrows: saves,
      multiclassRequirement: requirement,
      proficiencies: { armor: own.armor, weapons: own.weapons, tools: own.tools, skills },
      multiclassProficiencies: { armor: mcProfs.armor, weapons: mcProfs.weapons, tools: mcProfs.tools, ...(mcSkills ? { skills: mcSkills } : {}) },
      startingEquipment: startingEquipment(c.starting_equipment, c.starting_equipment_options, eq),
      startingGold: STARTING_GOLD[c.index] ?? '5d4*10',
      subclassLevel: SUBCLASS_LEVEL[c.index] ?? 3,
      subclassLabelRu: SUBCLASS_LABEL[c.index] ?? 'Подкласс',
      asiLevels,
      columns,
      levels,
      features: feats,
    };
    const sc = SPELLCASTING[c.index];
    if (sc) {
      const spellcasting: ClassSpellcasting = { ...sc };
      if (hasCantrips) spellcasting.cantripsKnown = levels.map((l) => Number(l.values.cantrips_known ?? 0));
      if (hasKnown && sc.preparation === 'known') spellcasting.spellsKnown = levels.map((l) => Number(l.values.spells_known ?? 0));
      data.spellcasting = spellcasting;
    }
    const nameRu = tr.t('classes', c.index, c.name);
    out.push({
      key: key('class', c.index),
      kind: 'class',
      slug: c.index,
      nameRu,
      nameEn: c.name,
      sourceBook: 'SRD 5.1',
      textMd: classSummaryMd(data),
      effectsStatus: entityStatus(feats),
      data,
    });
  }

  for (const s of src.subclasses) {
    const feats = src.features
      .filter((f) => f.subclass?.index === s.index && !f.parent)
      .sort((a, b) => a.level - b.level)
      .map((f) => makeFeature(f, featuresByIndex, tr));
    const data: SubclassData = { classKey: key('class', s.class.index), features: feats };
    const byLevel = new Map<number, string[]>();
    const conditional = (s.spells ?? []).some((x) => x.prerequisites.some((p) => p.type === 'feature'));
    const levelOf = (sp: NonNullable<typeof s.spells>[number]) => {
      const lvl = sp.prerequisites.find((p) => p.type === 'level');
      return lvl ? Number(/-(\d+)$/.exec(lvl.index)?.[1] ?? 1) : 1;
    };
    if (!conditional) {
      for (const sp of s.spells ?? []) {
        const n = levelOf(sp);
        const list = byLevel.get(n) ?? [];
        list.push(key('spell', sp.spell.index));
        byLevel.set(n, list);
      }
    } else {
      // Заклинания, зависящие от выбора (Круг земли: местность) → эффекты варианта выбора.
      const items = feats.flatMap((f) =>
        f.effects.flatMap((e) => (e.type === 'choice' && e.options.kind === 'list' ? e.options.items : [])),
      );
      for (const sp of s.spells ?? []) {
        const req = sp.prerequisites.find((p) => p.type === 'feature');
        const item = req ? items.find((i) => i.value === req.index) : undefined;
        if (!item) continue;
        item.effects.push({
          type: 'spell_grant',
          spell: key('spell', sp.spell.index),
          ability: 'class',
          mode: 'always_prepared',
          when: `CLASS_LEVEL >= ${levelOf(sp)}`,
        });
      }
      for (const f of feats) f.effectsStatus = effectsStatusOf(f.effects);
    }
    if (byLevel.size) {
      if (s.class.index === 'warlock') {
        const spellLevel = new Map(src.spells.map((x) => [key('spell', x.index), x.level]));
        const bySpellLevel = new Map<number, string[]>();
        for (const list of byLevel.values()) {
          for (const k of list) {
            const l = spellLevel.get(k) ?? 1;
            bySpellLevel.set(l, [...(bySpellLevel.get(l) ?? []), k]);
          }
        }
        data.expandedSpellList = [...bySpellLevel.entries()].sort((a, b) => a[0] - b[0]).map(([spellLevel, spells]) => ({ spellLevel, spells }));
      } else {
        data.alwaysPrepared = [...byLevel.entries()].sort((a, b) => a[0] - b[0]).map(([classLevel, spells]) => ({ classLevel, spells }));
      }
    }
    out.push({
      key: key('subclass', s.index),
      kind: 'subclass',
      slug: s.index,
      nameRu: tr.t('subclasses', s.index, s.name),
      nameEn: s.name,
      sourceBook: 'SRD 5.1',
      textMd: paragraphs(s.desc),
      effectsStatus: entityStatus(feats),
      data,
    });
  }
  return out;
}

export function entityStatus(features: Feature[]): ContentEntity['effectsStatus'] {
  const visible = features.filter((f) => !f.hidden);
  if (!visible.length || visible.every((f) => f.effectsStatus === 'text_only')) return 'text_only';
  if (visible.every((f) => f.effectsStatus === 'complete')) return 'complete';
  return 'partial';
}

const ABILITY_RU: Record<string, string> = { str: 'Сила', dex: 'Ловкость', con: 'Телосложение', int: 'Интеллект', wis: 'Мудрость', cha: 'Харизма' };

function classSummaryMd(d: ClassData): string {
  const lines = [
    `**Кость хитов:** к${d.hitDie}`,
    `**Спасброски:** ${d.savingThrows.map((a) => ABILITY_RU[a]).join(', ')}`,
    `**Подкласс:** ${d.subclassLabelRu} (с ${d.subclassLevel} уровня)`,
  ];
  return lines.join('\n\n');
}
