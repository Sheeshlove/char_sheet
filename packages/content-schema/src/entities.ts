import { z } from 'zod';
import {
  abilitySchema,
  contentKeySchema,
  damageTypeSchema,
  exprSchema,
  sizeSchema,
  skillSchema,
  SPELL_SCHOOLS,
  type ContentKind,
} from './base';
import { effectSchema, effectsStatusSchema, featureSchema, predicateSchema } from './effects';

const armorCat = z.enum(['light', 'medium', 'heavy', 'shield']);

// ─── Расы ─────────────────────────────────────────────────────────────────

export const raceDataSchema = z.strictObject({
  size: sizeSchema,
  speed: z.strictObject({
    walk: z.number().int().min(0),
    fly: z.number().int().min(0).optional(),
    swim: z.number().int().min(0).optional(),
    climb: z.number().int().min(0).optional(),
    burrow: z.number().int().min(0).optional(),
  }),
  subraceRequired: z.boolean(),
  features: z.array(featureSchema),
  ageMd: z.string().optional(),
  alignmentMd: z.string().optional(),
});
export type RaceData = z.infer<typeof raceDataSchema>;

export const subraceDataSchema = z.strictObject({
  raceKey: contentKeySchema,
  features: z.array(featureSchema),
});
export type SubraceData = z.infer<typeof subraceDataSchema>;

// ─── Классы ───────────────────────────────────────────────────────────────

export const multiclassRequirementSchema = z.strictObject({
  all: z.array(z.tuple([abilitySchema, z.number().int()])).optional(),
  any: z.array(z.tuple([abilitySchema, z.number().int()])).optional(),
});
export type MulticlassRequirement = z.infer<typeof multiclassRequirementSchema>;

export const classSpellcastingSchema = z.strictObject({
  ability: abilitySchema,
  progression: z.enum(['full', 'half', 'half_up', 'third', 'pact']),
  preparation: z.enum(['known', 'prepared', 'spellbook']),
  spellListKey: z.string().min(1),
  cantripsKnown: z.array(z.number().int().min(0)).length(20).optional(),
  spellsKnown: z.array(z.number().int().min(0)).length(20).optional(),
  preparedFormula: exprSchema.optional(),
  ritualCasting: z.enum(['none', 'prepared_only', 'from_book']),
  schoolRestriction: z
    .strictObject({ schools: z.array(z.enum(SPELL_SCHOOLS)), freePicksAtLevels: z.array(z.number().int()) })
    .optional(),
  /** Уровень класса, с которого действует «Использование заклинаний» (по умолчанию из прогрессии). */
  startLevel: z.number().int().min(1).max(20).optional(),
});
export type ClassSpellcasting = z.infer<typeof classSpellcastingSchema>;

export const equipmentChoiceGroupSchema = z.strictObject({
  options: z.array(
    z.strictObject({
      items: z.array(z.strictObject({ key: z.string().min(1), qty: z.number().int().min(1) })),
    }),
  ),
});
export type EquipmentChoiceGroup = z.infer<typeof equipmentChoiceGroupSchema>;

const skillChoose = z.strictObject({
  choose: z.number().int().min(0),
  from: z.union([z.array(skillSchema), z.literal('any')]),
});

export const classDataSchema = z.strictObject({
  hitDie: z.union([z.literal(6), z.literal(8), z.literal(10), z.literal(12)]),
  savingThrows: z.tuple([abilitySchema, abilitySchema]),
  multiclassRequirement: multiclassRequirementSchema,
  proficiencies: z.strictObject({
    armor: z.array(armorCat),
    weapons: z.array(z.string()),
    tools: z.array(z.string()),
    skills: skillChoose,
  }),
  multiclassProficiencies: z.strictObject({
    armor: z.array(armorCat),
    weapons: z.array(z.string()),
    tools: z.array(z.string()),
    skills: z
      .strictObject({
        choose: z.number().int().min(0),
        from: z.union([z.array(skillSchema), z.literal('class_list'), z.literal('any')]),
      })
      .optional(),
  }),
  startingEquipment: z.array(equipmentChoiceGroupSchema),
  startingGold: z.string(),
  subclassLevel: z.number().int().min(1).max(20),
  subclassLabelRu: z.string(),
  asiLevels: z.array(z.number().int().min(1).max(20)),
  spellcasting: classSpellcastingSchema.optional(),
  columns: z.array(z.strictObject({ key: z.string().min(1), labelRu: z.string() })),
  levels: z.array(
    z.strictObject({
      level: z.number().int().min(1).max(20),
      featureKeys: z.array(z.string()),
      values: z.record(z.string(), z.union([z.string(), z.number()])),
    }),
  ),
  features: z.array(featureSchema),
});
export type ClassData = z.infer<typeof classDataSchema>;

export const subclassDataSchema = z.strictObject({
  classKey: contentKeySchema,
  spellcasting: classSpellcastingSchema.optional(),
  alwaysPrepared: z
    .array(z.strictObject({ classLevel: z.number().int().min(1).max(20), spells: z.array(contentKeySchema) }))
    .optional(),
  expandedSpellList: z
    .array(z.strictObject({ spellLevel: z.number().int().min(1).max(9), spells: z.array(contentKeySchema) }))
    .optional(),
  features: z.array(featureSchema),
});
export type SubclassData = z.infer<typeof subclassDataSchema>;

// ─── Предыстории, черты ──────────────────────────────────────────────────

export const backgroundDataSchema = z.strictObject({
  skills: z.union([z.array(skillSchema), z.strictObject({ choose: z.number().int().min(1), from: z.array(skillSchema) })]),
  tools: z.array(z.string()),
  languages: z.union([z.strictObject({ choose: z.number().int().min(0) }), z.array(z.string())]),
  equipmentMd: z.string(),
  gold: z.number().min(0),
  feature: featureSchema,
  characteristics: z.strictObject({
    traits: z.array(z.string()),
    ideals: z.array(z.string()),
    bonds: z.array(z.string()),
    flaws: z.array(z.string()),
  }),
});
export type BackgroundData = z.infer<typeof backgroundDataSchema>;

export const featDataSchema = z.strictObject({
  prerequisite: z.strictObject({ textRu: z.string(), check: predicateSchema.optional() }).optional(),
  repeatable: z.boolean(),
  features: z.array(featureSchema),
});
export type FeatData = z.infer<typeof featDataSchema>;

// ─── Заклинания ───────────────────────────────────────────────────────────

export const spellDataSchema = z.strictObject({
  level: z.number().int().min(0).max(9),
  school: z.enum(SPELL_SCHOOLS),
  castingTime: z.strictObject({
    textRu: z.string(),
    unit: z.enum(['action', 'bonus_action', 'reaction', 'minute', 'hour', 'special']),
    amount: z.number().min(0),
  }),
  ritual: z.boolean(),
  range: z.strictObject({
    textRu: z.string(),
    feet: z.number().min(0).optional(),
    kind: z.enum(['self', 'touch', 'ranged', 'sight', 'unlimited', 'special']),
  }),
  components: z.strictObject({
    v: z.boolean(),
    s: z.boolean(),
    m: z.boolean(),
    materialRu: z.string().optional(),
    costGp: z.number().min(0).optional(),
    consumed: z.boolean().optional(),
  }),
  duration: z.strictObject({ textRu: z.string(), concentration: z.boolean() }),
  classes: z.array(z.string()),
  subclasses: z.array(contentKeySchema),
  attack: z.enum(['melee', 'ranged']).optional(),
  save: abilitySchema.optional(),
  damage: z
    .array(z.strictObject({ dice: z.string(), type: damageTypeSchema, scaling: z.enum(['slot', 'cantrip']).optional() }))
    .optional(),
  heal: z.strictObject({ dice: z.string(), addSpellMod: z.boolean(), scaling: z.literal('slot').optional() }).optional(),
  higherLevelsMd: z.string().optional(),
  /** Эффекты на заклинателя, пока заклинание действует (переключатель `spell:<key>` в листе). */
  selfEffects: z.array(effectSchema).optional(),
});
export type SpellData = z.infer<typeof spellDataSchema>;

// ─── Снаряжение ───────────────────────────────────────────────────────────

export const WEAPON_PROPERTIES = [
  'ammunition',
  'finesse',
  'heavy',
  'light',
  'loading',
  'range',
  'reach',
  'special',
  'thrown',
  'two_handed',
  'versatile',
] as const;

export const weaponDataSchema = z.strictObject({
  category: z.enum(['simple', 'martial']),
  range: z.enum(['melee', 'ranged']),
  damage: z.strictObject({ dice: z.string(), type: damageTypeSchema }),
  versatileDice: z.string().optional(),
  properties: z.array(z.enum(WEAPON_PROPERTIES)),
  rangeFt: z.strictObject({ normal: z.number().int(), long: z.number().int() }).optional(),
  costCp: z.number().int().min(0),
  weightLb: z.number().min(0),
  monkWeapon: z.boolean(),
});
export type WeaponData = z.infer<typeof weaponDataSchema>;

export const armorDataSchema = z.strictObject({
  category: armorCat,
  baseAc: z.number().int(),
  dexCap: z.number().int().nullable(),
  strRequirement: z.number().int().optional(),
  stealthDisadvantage: z.boolean(),
  costCp: z.number().int().min(0),
  weightLb: z.number().min(0),
});
export type ArmorData = z.infer<typeof armorDataSchema>;

export const gearDataSchema = z.strictObject({
  costCp: z.number().int().min(0),
  weightLb: z.number().min(0),
  capacityLb: z.number().min(0).optional(),
  kind: z.enum(['gear', 'ammunition', 'pack', 'focus', 'tool', 'mount', 'trade_good']),
  /** Для инструментов: группа (ремесленника, музыкальные, игровые наборы). */
  toolGroup: z.enum(['artisan', 'musical', 'gaming', 'other']).optional(),
  /** Для фокусировок: магическая, друидическая или священный символ (категория 5e-database). */
  focusGroup: z.enum(['arcane', 'druidic', 'holy']).optional(),
  /** Для наборов снаряжения: содержимое. */
  contents: z.array(z.strictObject({ key: contentKeySchema, qty: z.number().int().min(1) })).optional(),
});
export type GearData = z.infer<typeof gearDataSchema>;

const baseItemAnyOf = z.enum([
  'any_weapon',
  'any_armor',
  'any_sword',
  'any_axe',
  'light_armor',
  'medium_or_heavy_armor',
  'ammunition',
]);

export const magicItemDataSchema = z.strictObject({
  itemType: z.enum(['weapon', 'armor', 'shield', 'wondrous', 'ring', 'rod', 'staff', 'wand', 'potion', 'scroll', 'ammunition']),
  baseItem: z.union([contentKeySchema, z.strictObject({ anyOf: baseItemAnyOf })]).optional(),
  rarity: z.enum(['common', 'uncommon', 'rare', 'very_rare', 'legendary', 'artifact', 'varies']),
  attunement: z.union([
    z.literal(false),
    z.strictObject({ byRu: z.string().optional(), check: predicateSchema.optional() }),
  ]),
  charges: z
    .strictObject({ max: exprSchema, rechargeRu: z.string(), reset: z.enum(['dawn', 'long', 'short', 'none']) })
    .optional(),
  effects: z.array(effectSchema),
  effectsStatus: effectsStatusSchema,
  weightLb: z.number().min(0).optional(),
});
export type MagicItemData = z.infer<typeof magicItemDataSchema>;

export const languageDataSchema = z.strictObject({
  type: z.enum(['standard', 'exotic', 'secret']),
  scriptRu: z.string().optional(),
  speakersRu: z.string().optional(),
});
export type LanguageData = z.infer<typeof languageDataSchema>;

export const conditionDataSchema = z.strictObject({
  effects: z.array(effectSchema),
  effectsStatus: effectsStatusSchema,
  /** Состояния, которые включает это (бессознательный → недееспособный, сбитый с ног). */
  implies: z.array(z.string()).optional(),
});
export type ConditionData = z.infer<typeof conditionDataSchema>;

/** Отдельное умение-сущность (боевой стиль, воззвание и т. п.). */
export const featureEntityDataSchema = z.strictObject({
  featureType: z.string().optional(),
  prerequisite: z.strictObject({ textRu: z.string(), check: predicateSchema.optional() }).optional(),
  features: z.array(featureSchema),
});
export type FeatureEntityData = z.infer<typeof featureEntityDataSchema>;

export const ENTITY_DATA_SCHEMAS = {
  race: raceDataSchema,
  subrace: subraceDataSchema,
  class: classDataSchema,
  subclass: subclassDataSchema,
  background: backgroundDataSchema,
  feat: featDataSchema,
  spell: spellDataSchema,
  item: magicItemDataSchema,
  weapon: weaponDataSchema,
  armor: armorDataSchema,
  gear: gearDataSchema,
  tool: gearDataSchema,
  language: languageDataSchema,
  condition: conditionDataSchema,
  feature: featureEntityDataSchema,
} as const satisfies Record<ContentKind, z.ZodType>;

export type EntityDataByKind = {
  [K in ContentKind]: z.infer<(typeof ENTITY_DATA_SCHEMAS)[K]>;
};

// ─── Сущность контента ────────────────────────────────────────────────────

export const contentEntitySchema = z.strictObject({
  key: contentKeySchema,
  kind: z.enum([
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
  ]),
  slug: z.string().min(1),
  nameRu: z.string().min(1),
  nameEn: z.string().optional(),
  sourceBook: z.string().optional(),
  sourceUrl: z.string().optional(),
  data: z.unknown(),
  textMd: z.string().optional(),
  effectsStatus: effectsStatusSchema,
  removed: z.boolean().optional(),
});

/** Сущность контента с данными, типизированными по виду. */
export type ContentEntity<K extends ContentKind = ContentKind> = {
  [P in K]: {
    key: string;
    kind: P;
    slug: string;
    nameRu: string;
    nameEn?: string;
    sourceBook?: string;
    sourceUrl?: string;
    data: EntityDataByKind[P];
    textMd?: string;
    effectsStatus: 'complete' | 'partial' | 'text_only';
    removed?: boolean;
  };
}[K];

/** Проверка данных сущности схемой её вида. */
export function parseEntityData<K extends ContentKind>(kind: K, data: unknown) {
  return ENTITY_DATA_SCHEMAS[kind].safeParse(data);
}

export { effectSchema };
