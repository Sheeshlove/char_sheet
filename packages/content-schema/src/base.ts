import { z } from 'zod';

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type Ability = (typeof ABILITIES)[number];
export const abilitySchema = z.enum(ABILITIES);

export const SKILLS = [
  'acrobatics',
  'animal_handling',
  'arcana',
  'athletics',
  'deception',
  'history',
  'insight',
  'intimidation',
  'investigation',
  'medicine',
  'nature',
  'perception',
  'performance',
  'persuasion',
  'religion',
  'sleight_of_hand',
  'stealth',
  'survival',
] as const;
export type SkillId = (typeof SKILLS)[number];
export const skillSchema = z.enum(SKILLS);

/** Характеристика каждого навыка (SPEC §8.5). */
export const SKILL_ABILITY: Record<SkillId, Ability> = {
  athletics: 'str',
  acrobatics: 'dex',
  sleight_of_hand: 'dex',
  stealth: 'dex',
  investigation: 'int',
  history: 'int',
  arcana: 'int',
  nature: 'int',
  religion: 'int',
  perception: 'wis',
  survival: 'wis',
  medicine: 'wis',
  insight: 'wis',
  animal_handling: 'wis',
  performance: 'cha',
  intimidation: 'cha',
  deception: 'cha',
  persuasion: 'cha',
};

export const SIZES = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'] as const;
export type Size = (typeof SIZES)[number];
export const sizeSchema = z.enum(SIZES);

export const DAMAGE_TYPES = [
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder',
] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];
export const damageTypeSchema = z.enum(DAMAGE_TYPES);

export const CONDITIONS = [
  'blinded',
  'charmed',
  'deafened',
  'exhaustion',
  'frightened',
  'grappled',
  'incapacitated',
  'invisible',
  'paralyzed',
  'petrified',
  'poisoned',
  'prone',
  'restrained',
  'stunned',
  'unconscious',
] as const;
export type ConditionId = (typeof CONDITIONS)[number];
export const conditionSchema = z.enum(CONDITIONS);

export const SPELL_SCHOOLS = [
  'abjuration',
  'conjuration',
  'divination',
  'enchantment',
  'evocation',
  'illusion',
  'necromancy',
  'transmutation',
] as const;
export type SpellSchool = (typeof SPELL_SCHOOLS)[number];

export const CONTENT_KINDS = [
  'race',
  'subrace',
  'class',
  'subclass',
  'background',
  'feat',
  'spell',
  'item',
  'weapon',
  'armor',
  'gear',
  'tool',
  'language',
  'condition',
  'feature',
] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

/** Выражение (SPEC §6.4): строка, разбирается jsep и считается собственным интерпретатором. */
export type Expr = string;
export const exprSchema = z.string().min(1).max(500);

/** Ключ контента `<pack>/<kind>/<slug>`. */
export type ContentKey = string;
export const CONTENT_KEY_RE = /^[a-z0-9][a-z0-9-]*\/[a-z_]+\/[a-z0-9][a-z0-9._~-]*$/;
export const contentKeySchema = z.string().regex(CONTENT_KEY_RE);

export function parseContentKey(key: ContentKey): { pack: string; kind: string; slug: string } {
  const [pack = '', kind = '', ...rest] = key.split('/');
  return { pack, kind, slug: rest.join('/') };
}

/** Кость в нотации движка: `1d6`, `2d8`. Русская запись `1к6` приводится к ней. */
export function normalizeDice(s: string): string {
  return s.replace(/к/giu, 'd').replace(/\s+/g, '');
}
