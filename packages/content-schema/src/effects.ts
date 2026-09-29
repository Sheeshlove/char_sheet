import { z } from 'zod';
import {
  abilitySchema,
  conditionSchema,
  contentKeySchema,
  damageTypeSchema,
  exprSchema,
  sizeSchema,
  skillSchema,
  SPELL_SCHOOLS,
  type Ability,
  type ConditionId,
  type ContentKey,
  type DamageType,
  type Expr,
  type Size,
  type SkillId,
} from './base';

// ─── Цели (SPEC §6.3) ─────────────────────────────────────────────────────

export type ArmorCategory = 'light' | 'medium' | 'heavy' | 'shield';
export type SpeedMode = 'walk' | 'fly' | 'swim' | 'climb' | 'burrow';

export type ProfTarget =
  | `skill:${SkillId}`
  | `save:${Ability}`
  | `armor:${ArmorCategory}`
  | `weapon:${string}`
  | `tool:${string}`
  | `language:${string}`;

export type StatTarget =
  | 'ac'
  | 'initiative'
  | 'hp_max'
  | `speed:${SpeedMode}`
  | `save:${Ability}`
  | 'save:*'
  | `check:${Ability}`
  | 'check:*'
  | `skill:${SkillId}`
  | `passive:${SkillId}`
  | 'attack:melee_weapon'
  | 'attack:ranged_weapon'
  | 'attack:spell'
  | 'damage:melee_weapon'
  | 'damage:ranged_weapon'
  | 'spell_dc'
  | 'carry_capacity';

export type RollTarget = StatTarget | 'attack:*' | 'death_save' | 'concentration';

const ABIL = '(str|dex|con|int|wis|cha)';
const SKILL = `(${skillSchema.options.join('|')})`;
const SPEED = '(walk|fly|swim|climb|burrow)';
const SLUG = '[a-z0-9][a-z0-9_-]*';

const profTargetRe = new RegExp(
  `^(skill:${SKILL}|save:${ABIL}|armor:(light|medium|heavy|shield)|weapon:${SLUG}|tool:${SLUG}|language:${SLUG})$`,
);
const statTargetRe = new RegExp(
  `^(ac|initiative|hp_max|speed:${SPEED}|save:${ABIL}|save:\\*|check:${ABIL}|check:\\*|skill:${SKILL}|passive:${SKILL}|attack:(melee_weapon|ranged_weapon|spell)|damage:(melee_weapon|ranged_weapon)|spell_dc|carry_capacity)$`,
);
const rollTargetRe = new RegExp(`${statTargetRe.source.slice(0, -2)}|attack:\\*|death_save|concentration)$`);

export const profTargetSchema = z.string().regex(profTargetRe) as unknown as z.ZodType<ProfTarget>;
export const statTargetSchema = z.string().regex(statTargetRe) as unknown as z.ZodType<StatTarget>;
export const rollTargetSchema = z.string().regex(rollTargetRe) as unknown as z.ZodType<RollTarget>;

// ─── Предикаты (SPEC §6.4) ────────────────────────────────────────────────

export type Predicate =
  | Expr
  | { armor: 'none' | 'light' | 'medium' | 'heavy' | 'not_heavy' | 'any' }
  | { shield: boolean }
  | { toggle: string }
  | { wielding: 'one_melee_weapon_no_other' | 'two_weapons' | 'ranged_weapon' | 'heavy_weapon' | 'finesse_or_ranged' }
  | { attackAbility: Ability }
  | { all: Predicate[] }
  | { any: Predicate[] }
  | { not: Predicate };

export const predicateSchema: z.ZodType<Predicate> = z.lazy(() =>
  z.union([
    exprSchema,
    z.strictObject({ armor: z.enum(['none', 'light', 'medium', 'heavy', 'not_heavy', 'any']) }),
    z.strictObject({ shield: z.boolean() }),
    z.strictObject({ toggle: z.string().min(1) }),
    z.strictObject({
      wielding: z.enum(['one_melee_weapon_no_other', 'two_weapons', 'ranged_weapon', 'heavy_weapon', 'finesse_or_ranged']),
    }),
    z.strictObject({ attackAbility: abilitySchema }),
    z.strictObject({ all: z.array(predicateSchema) }),
    z.strictObject({ any: z.array(predicateSchema) }),
    z.strictObject({ not: predicateSchema }),
  ]),
);

// ─── Источники выбора ─────────────────────────────────────────────────────

export type WeaponFilter = {
  category?: 'simple' | 'martial';
  range?: 'melee' | 'ranged';
  properties?: string[];
  notProperties?: string[];
  keys?: string[];
  monkWeapon?: boolean;
  includeUnarmed?: boolean;
};

export const weaponFilterSchema = z.strictObject({
  category: z.enum(['simple', 'martial']).optional(),
  range: z.enum(['melee', 'ranged']).optional(),
  properties: z.array(z.string()).optional(),
  notProperties: z.array(z.string()).optional(),
  keys: z.array(z.string()).optional(),
  monkWeapon: z.boolean().optional(),
  includeUnarmed: z.boolean().optional(),
});

export type ChoiceSource =
  | { kind: 'list'; items: { value: string; labelRu: string; effects: Effect[] }[] }
  /** `tools` — инструменты, которые можно выбрать вместо навыка (Компетентность плута: воровские инструменты). */
  | { kind: 'skills'; from: SkillId[] | 'any'; grant: 'proficient' | 'expertise'; requireProficient?: boolean; tools?: string[] }
  | { kind: 'languages' }
  | { kind: 'tools'; group?: 'artisan' | 'musical' | 'gaming' | 'any' }
  | { kind: 'ability_increase'; points: number; maxPerAbility: number; abilities?: Ability[] }
  | { kind: 'feat' }
  /**
   * `list: '*'` — заклинания всех списков; `level: 'up_to_max'` — заговоры и круги, доступные
   * классу-источнику («Тайны магии» барда).
   */
  | { kind: 'spells'; list: string; level: number | 'cantrip' | 'up_to_max'; school?: string[] }
  | { kind: 'fighting_style'; styles: string[] };

// ─── Эффекты ──────────────────────────────────────────────────────────────

type Common = { id?: string; when?: Predicate };

export type Effect = Common &
  (
    | { type: 'ability'; ability: Ability; op: 'add' | 'set_min'; value: Expr }
    | { type: 'ability_cap'; ability: Ability; max: number }
    | { type: 'proficiency'; target: ProfTarget; level: 'proficient' | 'expertise' }
    | { type: 'half_proficiency'; scope: 'checks' | Ability[]; rounding: 'down' | 'up'; includeInitiative: boolean }
    | { type: 'bonus'; target: StatTarget; value: Expr; bonusType?: string; labelRu?: string }
    | {
        type: 'ac_formula';
        id: string;
        labelRu: string;
        base: Expr;
        allowShield: boolean;
        requires: 'no_armor' | 'no_armor_no_shield' | 'any';
      }
    | { type: 'speed'; mode: SpeedMode | 'all'; op: 'set' | 'add' | 'equal_walk' | 'zero'; value?: Expr }
    | { type: 'sense'; sense: 'darkvision' | 'blindsight' | 'tremorsense' | 'truesight'; rangeFt: number; op: 'set_max' | 'add' }
    | { type: 'size'; size: Size }
    | { type: 'carry'; sizeSteps: number }
    | { type: 'defense'; kind: 'resistance' | 'immunity' | 'vulnerability'; damageType: DamageType | 'nonmagical_bps'; noteRu?: string }
    | { type: 'condition_immunity'; condition: ConditionId }
    | { type: 'auto_fail'; saves: Ability[]; noteRu?: string }
    | {
        type: 'roll_mode';
        mode: 'advantage' | 'disadvantage';
        target: RollTarget | 'attacks_against_you';
        noteRu: string;
        conditional?: boolean;
      }
    | { type: 'hp_max'; value: Expr }
    | {
        type: 'attack';
        id: string;
        nameRu: string;
        ability: Ability | 'str_or_dex' | 'spell';
        proficient: boolean;
        damage: { dice: Expr; type: DamageType; addAbilityMod: boolean }[];
        reachFt?: number;
        rangeFt?: { normal: number; long: number };
      }
    | { type: 'weapon_option'; filter: WeaponFilter; allowAbilities?: Ability[]; minDamageDie?: Expr; labelRu: string }
    | { type: 'extra_attack'; attacks: number }
    | { type: 'crit_range'; min: number }
    | { type: 'unarmed_damage'; dice: Expr }
    | {
        type: 'armor_rule';
        category: 'light' | 'medium' | 'heavy';
        dexCap?: number;
        noStealthDisadvantage?: boolean;
        ignoreStrSpeedPenalty?: boolean;
      }
    | {
        type: 'combat_rule';
        rule: 'twf_ability_mod' | 'ignore_loading' | 'no_ranged_disadvantage_in_melee' | 'great_weapon_reroll' | 'versatile_d_up';
        noteRu?: string;
      }
    | { type: 'resource'; id: string; nameRu: string; max: Expr; reset: 'short' | 'long' | 'dawn' | 'none'; die?: Expr }
    | {
        type: 'spell_grant';
        spell: ContentKey | { choice: string };
        ability: Ability | 'class';
        mode: 'always_prepared' | 'known' | 'innate';
        uses?: { count: Expr; reset: 'short' | 'long' | 'dawn' };
        castAtLevel?: number;
        minCharacterLevel?: number;
      }
    /**
     * Прибавка к урону атак заклинаниями (строка атаки в листе): «Мучительный взрыв», «Усиленное
     * воплощение», «Родство со стихией». Фильтры объединяются по «или»; без фильтров — ко всем.
     */
    | {
        type: 'spell_damage_bonus';
        value: Expr;
        labelRu: string;
        spells?: ContentKey[];
        schools?: (typeof SPELL_SCHOOLS)[number][];
        damageTypes?: DamageType[];
      }
    /** Расширение списка класса; `{ choice }` — заклинания, выбранные в выборе этого умения. */
    | { type: 'spell_list_extend'; list: string; spells: ContentKey[] | { choice: string } }
    | {
        type: 'choice';
        id: string;
        labelRu: string;
        choose: number | Expr;
        options: ChoiceSource;
        replaceOnLevelUp?: boolean;
      }
    | {
        type: 'toggle';
        id: string;
        labelRu: string;
        effects: Effect[];
        cost?: { resource: string; amount: number };
        exclusiveGroup?: string;
      }
    | { type: 'text'; noteRu?: string }
  );

export type EffectType = Effect['type'];
export type EffectOf<T extends EffectType> = Extract<Effect, { type: T }>;

const common = {
  id: z.string().min(1).max(80).optional(),
  when: predicateSchema.optional(),
};

const choiceSourceSchema: z.ZodType<ChoiceSource> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('list'),
      items: z.array(
        z.strictObject({ value: z.string().min(1), labelRu: z.string().min(1), effects: z.array(effectSchema) }),
      ),
    }),
    z.strictObject({
      kind: z.literal('skills'),
      from: z.union([z.array(skillSchema), z.literal('any')]),
      grant: z.enum(['proficient', 'expertise']),
      requireProficient: z.boolean().optional(),
      tools: z.array(z.string().min(1)).optional(),
    }),
    z.strictObject({ kind: z.literal('languages') }),
    z.strictObject({ kind: z.literal('tools'), group: z.enum(['artisan', 'musical', 'gaming', 'any']).optional() }),
    z.strictObject({
      kind: z.literal('ability_increase'),
      points: z.number().int().min(1),
      maxPerAbility: z.number().int().min(1),
      abilities: z.array(abilitySchema).optional(),
    }),
    z.strictObject({ kind: z.literal('feat') }),
    z.strictObject({
      kind: z.literal('spells'),
      list: z.string().min(1),
      level: z.union([z.number().int().min(0).max(9), z.literal('cantrip'), z.literal('up_to_max')]),
      school: z.array(z.string()).optional(),
    }),
    z.strictObject({ kind: z.literal('fighting_style'), styles: z.array(z.string()) }),
  ]),
);

export const effectSchema: z.ZodType<Effect> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.strictObject({ ...common, type: z.literal('ability'), ability: abilitySchema, op: z.enum(['add', 'set_min']), value: exprSchema }),
    z.strictObject({ ...common, type: z.literal('ability_cap'), ability: abilitySchema, max: z.number().int().min(1).max(30) }),
    z.strictObject({
      ...common,
      type: z.literal('proficiency'),
      target: profTargetSchema,
      level: z.enum(['proficient', 'expertise']),
    }),
    z.strictObject({
      ...common,
      type: z.literal('half_proficiency'),
      scope: z.union([z.literal('checks'), z.array(abilitySchema)]),
      rounding: z.enum(['down', 'up']),
      includeInitiative: z.boolean(),
    }),
    z.strictObject({
      ...common,
      type: z.literal('bonus'),
      target: statTargetSchema,
      value: exprSchema,
      bonusType: z.string().optional(),
      labelRu: z.string().optional(),
    }),
    z.strictObject({
      ...common,
      type: z.literal('ac_formula'),
      id: z.string().min(1),
      labelRu: z.string().min(1),
      base: exprSchema,
      allowShield: z.boolean(),
      requires: z.enum(['no_armor', 'no_armor_no_shield', 'any']),
    }),
    z.strictObject({
      ...common,
      type: z.literal('speed'),
      mode: z.enum(['walk', 'fly', 'swim', 'climb', 'burrow', 'all']),
      op: z.enum(['set', 'add', 'equal_walk', 'zero']),
      value: exprSchema.optional(),
    }),
    z.strictObject({
      ...common,
      type: z.literal('sense'),
      sense: z.enum(['darkvision', 'blindsight', 'tremorsense', 'truesight']),
      rangeFt: z.number().int().min(0),
      op: z.enum(['set_max', 'add']),
    }),
    z.strictObject({ ...common, type: z.literal('size'), size: sizeSchema }),
    z.strictObject({ ...common, type: z.literal('carry'), sizeSteps: z.number().int() }),
    z.strictObject({
      ...common,
      type: z.literal('defense'),
      kind: z.enum(['resistance', 'immunity', 'vulnerability']),
      damageType: z.union([damageTypeSchema, z.literal('nonmagical_bps')]),
      noteRu: z.string().optional(),
    }),
    z.strictObject({ ...common, type: z.literal('condition_immunity'), condition: conditionSchema }),
    z.strictObject({ ...common, type: z.literal('auto_fail'), saves: z.array(abilitySchema), noteRu: z.string().optional() }),
    z.strictObject({
      ...common,
      type: z.literal('roll_mode'),
      mode: z.enum(['advantage', 'disadvantage']),
      target: z.union([rollTargetSchema, z.literal('attacks_against_you')]),
      noteRu: z.string(),
      conditional: z.boolean().optional(),
    }),
    z.strictObject({ ...common, type: z.literal('hp_max'), value: exprSchema }),
    z.strictObject({
      ...common,
      type: z.literal('attack'),
      id: z.string().min(1),
      nameRu: z.string().min(1),
      ability: z.union([abilitySchema, z.literal('str_or_dex'), z.literal('spell')]),
      proficient: z.boolean(),
      damage: z.array(z.strictObject({ dice: exprSchema, type: damageTypeSchema, addAbilityMod: z.boolean() })),
      reachFt: z.number().int().optional(),
      rangeFt: z.strictObject({ normal: z.number().int(), long: z.number().int() }).optional(),
    }),
    z.strictObject({
      ...common,
      type: z.literal('weapon_option'),
      filter: weaponFilterSchema,
      allowAbilities: z.array(abilitySchema).optional(),
      minDamageDie: exprSchema.optional(),
      labelRu: z.string(),
    }),
    z.strictObject({ ...common, type: z.literal('extra_attack'), attacks: z.number().int().min(1) }),
    z.strictObject({ ...common, type: z.literal('crit_range'), min: z.number().int().min(2).max(20) }),
    z.strictObject({ ...common, type: z.literal('unarmed_damage'), dice: exprSchema }),
    z.strictObject({
      ...common,
      type: z.literal('armor_rule'),
      category: z.enum(['light', 'medium', 'heavy']),
      dexCap: z.number().int().optional(),
      noStealthDisadvantage: z.boolean().optional(),
      ignoreStrSpeedPenalty: z.boolean().optional(),
    }),
    z.strictObject({
      ...common,
      type: z.literal('combat_rule'),
      rule: z.enum(['twf_ability_mod', 'ignore_loading', 'no_ranged_disadvantage_in_melee', 'great_weapon_reroll', 'versatile_d_up']),
      noteRu: z.string().optional(),
    }),
    z.strictObject({
      ...common,
      type: z.literal('resource'),
      id: z.string().min(1),
      nameRu: z.string().min(1),
      max: exprSchema,
      reset: z.enum(['short', 'long', 'dawn', 'none']),
      die: exprSchema.optional(),
    }),
    z.strictObject({
      ...common,
      type: z.literal('spell_grant'),
      spell: z.union([contentKeySchema, z.strictObject({ choice: z.string().min(1) })]),
      ability: z.union([abilitySchema, z.literal('class')]),
      mode: z.enum(['always_prepared', 'known', 'innate']),
      uses: z.strictObject({ count: exprSchema, reset: z.enum(['short', 'long', 'dawn']) }).optional(),
      castAtLevel: z.number().int().min(1).max(9).optional(),
      minCharacterLevel: z.number().int().min(1).max(20).optional(),
    }),
    z.strictObject({
      ...common,
      type: z.literal('spell_damage_bonus'),
      value: exprSchema,
      labelRu: z.string().min(1),
      spells: z.array(contentKeySchema).optional(),
      schools: z.array(z.enum(SPELL_SCHOOLS)).optional(),
      damageTypes: z.array(damageTypeSchema).optional(),
    }),
    z.strictObject({
      ...common,
      type: z.literal('spell_list_extend'),
      list: z.string().min(1),
      spells: z.union([z.array(contentKeySchema), z.strictObject({ choice: z.string().min(1) })]),
    }),
    z.strictObject({
      ...common,
      type: z.literal('choice'),
      id: z.string().min(1),
      labelRu: z.string().min(1),
      choose: z.union([z.number().int().min(0), exprSchema]),
      options: choiceSourceSchema,
      replaceOnLevelUp: z.boolean().optional(),
    }),
    z.strictObject({
      ...common,
      type: z.literal('toggle'),
      id: z.string().min(1),
      labelRu: z.string().min(1),
      effects: z.array(effectSchema),
      cost: z.strictObject({ resource: z.string().min(1), amount: z.number().int().min(1) }).optional(),
      exclusiveGroup: z.string().optional(),
    }),
    z.strictObject({ ...common, type: z.literal('text'), noteRu: z.string().optional() }),
  ]),
);

export { choiceSourceSchema };

// ─── Умение ───────────────────────────────────────────────────────────────

export type EffectsStatus = 'complete' | 'partial' | 'text_only';
export const effectsStatusSchema = z.enum(['complete', 'partial', 'text_only']);

export type Feature = {
  key: string;
  nameRu: string;
  nameEn?: string;
  level?: number;
  textMd: string;
  effects: Effect[];
  effectsStatus: EffectsStatus;
  hidden?: boolean;
};

export const featureSchema = z.strictObject({
  key: z.string().min(1).max(120),
  nameRu: z.string().min(1),
  nameEn: z.string().optional(),
  level: z.number().int().min(1).max(20).optional(),
  textMd: z.string(),
  effects: z.array(effectSchema),
  effectsStatus: effectsStatusSchema,
  hidden: z.boolean().optional(),
}) satisfies z.ZodType<Feature>;

export { contentKeySchema, damageTypeSchema };
