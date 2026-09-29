import {
  CONDITIONS,
  type Ability,
  type BackgroundData,
  type ConditionId,
  type ContentEntity,
  type Effect,
  type Feature,
  type ProfTarget,
  type RaceData,
  type Size,
  type SubraceData,
} from '@ps/content-schema';
import { CONDITION_EFFECTS, CONDITION_LABEL_RU } from '@ps/rules-engine';
import { paragraphs } from '../util/text';
import type { Translator } from './dict';
import { key, type EquipmentIndex } from './convert-equipment';
import { entityStatus, profIndex, profTargets, skillFromProf, startingEquipment, type ProfIndex } from './convert-classes';
import type { Choice, SrdData, SrdTrait } from './types';

const prof = (target: string): Effect => ({ type: 'proficiency', target: target as ProfTarget, level: 'proficient' });

function statusOf(effects: Effect[]): Feature['effectsStatus'] {
  if (!effects.length) return 'text_only';
  return effects.some((e) => e.type === 'text') ? 'partial' : 'complete';
}

function refs(c: Choice | undefined): string[] {
  return (c?.from.options ?? []).flatMap((o) => (o.option_type === 'reference' ? [o.item.index] : []));
}

function choiceEffect(id: string, labelRu: string, c: Choice, profs: ProfIndex): Effect | null {
  const r = refs(c);
  if (!r.length) return null;
  if (r.every((x) => skillFromProf(x))) {
    return { type: 'choice', id, labelRu, choose: c.choose, options: { kind: 'skills', from: r.map((x) => skillFromProf(x)!), grant: 'proficient' } };
  }
  const items = r.map((x) => ({
    value: x,
    labelRu: profs.get(x)?.name ?? x,
    effects: profTargets(x, profs).map(prof),
  }));
  return { type: 'choice', id, labelRu, choose: c.choose, options: { kind: 'list', items } };
}

/** Черта расы → умение с автоматически извлекаемыми эффектами (владения, тёмное зрение, выборы). */
function traitFeature(t: SrdTrait, tr: Translator, profs: ProfIndex): Feature {
  const effects: Effect[] = [];
  for (const p of t.proficiencies) for (const target of profTargets(p.index, profs)) effects.push(prof(target));
  if (t.proficiency_choices) {
    const e = choiceEffect('choice', tr.t('traits', t.index, t.name), t.proficiency_choices, profs);
    if (e) effects.push(e);
  }
  if (t.index === 'darkvision') effects.push({ type: 'sense', sense: 'darkvision', rangeFt: 60, op: 'set_max' });
  if (t.language_options) {
    effects.push({ type: 'choice', id: 'language', labelRu: 'Дополнительный язык', choose: t.language_options.choose, options: { kind: 'languages' } });
  }
  const spells = t.trait_specific?.spell_options;
  if (spells) {
    effects.push(
      { type: 'choice', id: 'cantrip', labelRu: 'Заговор волшебника', choose: spells.choose, options: { kind: 'spells', list: 'wizard', level: 'cantrip' } },
      { type: 'spell_grant', spell: { choice: 'cantrip' }, ability: 'int', mode: 'known' },
    );
  }
  const sub = t.trait_specific?.subtrait_options;
  if (sub) {
    effects.push({
      type: 'choice',
      id: 'ancestry',
      labelRu: tr.t('traits', t.index, t.name),
      choose: sub.choose,
      options: {
        kind: 'list',
        items: refs(sub).map((r) => ({ value: r, labelRu: tr.t('traits', r, r).replace(/^[^:]+:\s*/, ''), effects: [] })),
      },
    });
  }
  return {
    key: t.index,
    nameRu: tr.t('traits', t.index, t.name),
    nameEn: t.name,
    textMd: paragraphs(t.desc),
    effects,
    effectsStatus: sub ? 'partial' : statusOf(effects),
  };
}

function asiFeature(bonuses: { ability_score: { index: string }; bonus: number }[], options?: Choice): Feature | null {
  const effects: Effect[] = bonuses.map((b) => ({ type: 'ability', ability: b.ability_score.index as Ability, op: 'add', value: String(b.bonus) }));
  if (options) {
    const abilities = (options.from.options ?? []).flatMap((o) => (o.option_type === 'ability_bonus' ? [o.ability_score.index as Ability] : []));
    effects.push({
      type: 'choice',
      id: 'asi',
      labelRu: 'Увеличение характеристик',
      choose: options.choose,
      options: { kind: 'ability_increase', points: options.choose, maxPerAbility: 1, abilities },
    });
  }
  if (!effects.length) return null;
  return { key: 'asi', nameRu: 'Увеличение характеристик', textMd: '', effects, effectsStatus: 'complete' };
}

const SIZE: Record<string, Size> = { Tiny: 'tiny', Small: 'small', Medium: 'medium', Large: 'large' };

export function convertRaces(src: SrdData, tr: Translator): ContentEntity[] {
  const profs = profIndex(src.proficiencies);
  const traits = new Map(src.traits.map((t) => [t.index, t]));
  const out: ContentEntity[] = [];
  for (const r of src.races) {
    const features: Feature[] = [];
    const asi = asiFeature(r.ability_bonuses, r.ability_bonus_options);
    if (asi) features.push(asi);
    for (const ref of r.traits) {
      const t = traits.get(ref.index);
      if (t && !t.parent) features.push(traitFeature(t, tr, profs));
    }
    const langEffects: Effect[] = r.languages.map((l) => prof(`language:${l.index}`));
    if (r.language_options) {
      langEffects.push({ type: 'choice', id: 'language', labelRu: 'Дополнительный язык', choose: r.language_options.choose, options: { kind: 'languages' } });
    }
    for (const p of r.starting_proficiencies ?? []) {
      if (features.some((f) => f.effects.some((e) => e.type === 'proficiency'))) break;
      for (const target of profTargets(p.index, profs)) langEffects.push(prof(target));
    }
    if (r.starting_proficiency_options) {
      const e = choiceEffect('skills', 'Навыки', r.starting_proficiency_options, profs);
      if (e) features.push({ key: 'skill-versatility', nameRu: 'Универсальность навыков', textMd: '', effects: [e], effectsStatus: 'complete' });
    }
    features.push({ key: 'languages', nameRu: 'Языки', textMd: r.language_desc, effects: langEffects, effectsStatus: 'complete' });
    const data: RaceData = {
      size: SIZE[r.size] ?? 'medium',
      speed: { walk: r.speed },
      subraceRequired: r.subraces.length > 0,
      features,
      ageMd: r.age,
      alignmentMd: r.alignment,
    };
    out.push({
      key: key('race', r.index),
      kind: 'race',
      slug: r.index,
      nameRu: tr.t('races', r.index, r.name),
      nameEn: r.name,
      sourceBook: 'SRD 5.1',
      textMd: [r.size_description, r.language_desc].filter(Boolean).join('\n\n'),
      effectsStatus: entityStatus(features),
      data,
    });
  }
  for (const s of src.subraces) {
    const features: Feature[] = [];
    const asi = asiFeature(s.ability_bonuses);
    if (asi) features.push(asi);
    for (const ref of s.racial_traits) {
      const t = traits.get(ref.index);
      if (t && !t.parent) features.push(traitFeature(t, tr, profs));
    }
    if (s.language_options) {
      features.push({
        key: 'extra-language',
        nameRu: 'Дополнительный язык',
        textMd: '',
        effects: [{ type: 'choice', id: 'language', labelRu: 'Дополнительный язык', choose: s.language_options.choose, options: { kind: 'languages' } }],
        effectsStatus: 'complete',
      });
    }
    const data: SubraceData = { raceKey: key('race', s.race.index), features };
    out.push({
      key: key('subrace', s.index),
      kind: 'subrace',
      slug: s.index,
      nameRu: tr.t('subraces', s.index, s.name),
      nameEn: s.name,
      sourceBook: 'SRD 5.1',
      textMd: s.desc,
      effectsStatus: entityStatus(features),
      data,
    });
  }
  return out;
}

export function convertBackgrounds(src: SrdData, tr: Translator, eq: EquipmentIndex): ContentEntity[] {
  const strings = (c: Choice) =>
    (c.from.options ?? []).flatMap((o) => (o.option_type === 'string' ? [o.string] : o.option_type === 'ideal' ? [o.desc] : []));
  return src.backgrounds.map((b) => {
    const skills = b.starting_proficiencies.map((p) => skillFromProf(p.index)).filter((x): x is NonNullable<typeof x> => !!x);
    const tools = b.starting_proficiencies.filter((p) => !skillFromProf(p.index)).map((p) => p.index);
    const equipment = startingEquipment(b.starting_equipment, b.starting_equipment_options, eq);
    const equipmentMd = equipment
      .map((g) => g.options.map((o) => o.items.map((i) => `${i.key.split('/').pop()} ×${i.qty}`).join(', ')).join(' или '))
      .join('; ');
    const data: BackgroundData = {
      skills,
      tools,
      languages: b.language_options ? { choose: b.language_options.choose } : [],
      equipmentMd,
      gold: b.starting_gold?.quantity ?? 0,
      feature: { key: 'feature', nameRu: tr.t('backgrounds', `${b.index}#feature`, b.feature.name), nameEn: b.feature.name, textMd: paragraphs(b.feature.desc), effects: [], effectsStatus: 'text_only' },
      characteristics: {
        traits: strings(b.personality_traits),
        ideals: strings(b.ideals),
        bonds: strings(b.bonds),
        flaws: strings(b.flaws),
      },
    };
    return {
      key: key('background', b.index),
      kind: 'background' as const,
      slug: b.index,
      nameRu: tr.t('backgrounds', b.index, b.name),
      nameEn: b.name,
      sourceBook: 'SRD 5.1',
      textMd: paragraphs(b.feature.desc),
      effectsStatus: 'partial' as const,
      data,
    };
  });
}

const ABILITY_RU: Record<string, string> = { str: 'Сила', dex: 'Ловкость', con: 'Телосложение', int: 'Интеллект', wis: 'Мудрость', cha: 'Харизма' };

export function convertFeats(src: SrdData, tr: Translator): ContentEntity[] {
  return src.feats.map((f) => {
    const pre = f.prerequisites;
    const data = {
      repeatable: false,
      ...(pre.length
        ? {
            prerequisite: {
              textRu: pre.map((p) => `${ABILITY_RU[p.ability_score.index] ?? p.ability_score.index} ${p.minimum_score}`).join(', '),
              check: pre.map((p) => `${p.ability_score.index.toUpperCase()}_SCORE >= ${p.minimum_score}`).join(' && '),
            },
          }
        : {}),
      features: [
        {
          key: f.index,
          nameRu: tr.t('feats', f.index, f.name),
          nameEn: f.name,
          textMd: paragraphs(f.desc),
          effects: [] as Effect[],
          effectsStatus: 'text_only' as const,
        },
      ],
    };
    return {
      key: key('feat', f.index),
      kind: 'feat' as const,
      slug: f.index,
      nameRu: tr.t('feats', f.index, f.name),
      nameEn: f.name,
      sourceBook: 'SRD 5.1',
      textMd: paragraphs(f.desc),
      effectsStatus: 'text_only' as const,
      data,
    };
  });
}

export function convertLanguages(src: SrdData): ContentEntity[] {
  const ru = new Map(src.languagesRu.map((l) => [l.index, l]));
  return src.languagesEn.map((l) => {
    const r = ru.get(l.index);
    const type = /exotic|экзот/i.test(l.type) ? 'exotic' : 'standard';
    return {
      key: key('language', l.index),
      kind: 'language' as const,
      slug: l.index,
      nameRu: r?.name ?? l.name,
      nameEn: l.name,
      sourceBook: 'SRD 5.1',
      textMd: r?.desc ?? l.desc ?? '',
      effectsStatus: 'complete' as const,
      data: {
        type: type as 'standard' | 'exotic',
        ...(r?.script || l.script ? { scriptRu: r?.script ?? l.script } : {}),
        ...(r?.typical_speakers?.length ? { speakersRu: r.typical_speakers.join(', ') } : {}),
      },
    };
  });
}

/** Состояния: русские названия по глоссарию, текст — русский перевод SRD, эффекты — таблица движка (SPEC §8.11). */
export function convertConditions(src: SrdData): ContentEntity[] {
  const ru = new Map(src.conditionsRu.map((c) => [c.index, c]));
  const en = new Map(src.conditionsEn.map((c) => [c.index, c]));
  return CONDITIONS.map((id: ConditionId) => {
    const table = id === 'exhaustion' ? undefined : CONDITION_EFFECTS[id];
    const effects = table?.effects ?? [];
    return {
      key: key('condition', id),
      kind: 'condition' as const,
      slug: id,
      nameRu: CONDITION_LABEL_RU[id],
      nameEn: en.get(id)?.name ?? id,
      sourceBook: 'SRD 5.1',
      textMd: paragraphs(ru.get(id)?.desc ?? en.get(id)?.desc),
      effectsStatus: 'complete' as const,
      data: {
        effects,
        effectsStatus: 'complete' as const,
        ...(table?.implies ? { implies: table.implies } : {}),
      },
    };
  });
}
