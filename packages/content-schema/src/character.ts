import { z } from 'zod';
import { abilitySchema, conditionSchema, contentKeySchema, damageTypeSchema, type Ability } from './base';
import { effectSchema } from './effects';
import { abilityMethodSchema } from './campaign';

// ─── Сборка персонажа (SPEC §8.2) ─────────────────────────────────────────

const abilityRecord = z.strictObject({
  str: z.number().int().min(1).max(30),
  dex: z.number().int().min(1).max(30),
  con: z.number().int().min(1).max(30),
  int: z.number().int().min(1).max(30),
  wis: z.number().int().min(1).max(30),
  cha: z.number().int().min(1).max(30),
});

const text = (max: number) => z.string().max(max);

export const levelAsiSchema = z.union([
  z.strictObject({
    kind: z.literal('asi'),
    increases: z.partialRecord(abilitySchema, z.union([z.literal(1), z.literal(2)])),
  }),
  z.strictObject({ kind: z.literal('feat'), featKey: contentKeySchema }),
]);

export const buildLevelSchema = z.strictObject({
  classKey: contentKeySchema,
  hp: z.strictObject({
    method: z.enum(['max', 'average', 'roll']),
    roll: z.number().int().min(1).max(12).optional(),
  }),
  asi: levelAsiSchema.optional(),
});

export const characterBuildSchema = z.strictObject({
  schemaVersion: z.literal(1),
  status: z.enum(['draft', 'ready']),
  identity: z.strictObject({
    name: text(120),
    alignment: text(60).optional(),
    age: text(60).optional(),
    height: text(60).optional(),
    weight: text(60).optional(),
    eyes: text(60).optional(),
    skin: text(60).optional(),
    hair: text(60).optional(),
    appearanceMd: text(20000).optional(),
    backstoryMd: text(50000).optional(),
    personality: z.strictObject({ traits: text(4000), ideals: text(4000), bonds: text(4000), flaws: text(4000) }),
    alliesMd: text(20000).optional(),
  }),
  abilities: z.strictObject({
    method: abilityMethodSchema,
    base: abilityRecord,
    rolls: z.array(z.array(z.number().int().min(1).max(6))).max(12).optional(),
  }),
  race: z.union([contentKeySchema, z.literal('')]),
  subrace: contentKeySchema.optional(),
  background: z.union([contentKeySchema, z.literal('')]),
  classes: z.array(z.strictObject({ classKey: contentKeySchema, subclassKey: contentKeySchema.optional() })).max(13),
  levels: z.array(buildLevelSchema).max(20),
  choices: z.record(z.string().max(300), z.array(z.string().max(200)).max(40)),
  knownSpells: z.array(
    z.strictObject({
      classKey: contentKeySchema,
      cantrips: z.array(contentKeySchema).max(40),
      spells: z.array(contentKeySchema).max(80),
      spellbook: z.array(contentKeySchema).max(300).optional(),
    }),
  ),
  manualEffects: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(80),
        labelRu: text(200),
        enabled: z.boolean(),
        effects: z.array(effectSchema),
      }),
    )
    .max(100),
  overrides: z.record(z.string().max(120), z.strictObject({ value: z.number(), reasonRu: text(300) })),
});
export type CharacterBuild = z.infer<typeof characterBuildSchema>;
export type BuildLevel = z.infer<typeof buildLevelSchema>;

// ─── Игровое состояние ────────────────────────────────────────────────────

export const inventoryItemSchema = z.strictObject({
  id: z.string().min(1).max(64),
  key: contentKeySchema.optional(),
  /** Базовый предмет для магических предметов вида «любое оружие» (+1 оружие и т. п.). */
  baseKey: contentKeySchema.optional(),
  customName: text(200).optional(),
  customWeightLb: z.number().min(0).max(100000).optional(),
  qty: z.number().int().min(0).max(100000),
  equipped: z.boolean(),
  attuned: z.boolean(),
  hand: z.enum(['main', 'off', 'both']).optional(),
  containerId: z.string().max(64).optional(),
  charges: z.number().int().min(0).max(1000).optional(),
  notesMd: text(4000).optional(),
});
export type InventoryItem = z.infer<typeof inventoryItemSchema>;

const currencySchema = z.strictObject({
  cp: z.number().int().min(0),
  sp: z.number().int().min(0),
  ep: z.number().int().min(0),
  gp: z.number().int().min(0),
  pp: z.number().int().min(0),
});

export const characterStateSchema = z.strictObject({
  hp: z.strictObject({ current: z.number().int(), temp: z.number().int().min(0) }),
  hitDiceUsed: z.strictObject({
    d6: z.number().int().min(0),
    d8: z.number().int().min(0),
    d10: z.number().int().min(0),
    d12: z.number().int().min(0),
  }),
  deathSaves: z.strictObject({
    successes: z.number().int().min(0).max(3),
    failures: z.number().int().min(0).max(3),
    stable: z.boolean(),
    dead: z.boolean(),
  }),
  slotsUsed: z.array(z.number().int().min(0)).max(10),
  pactSlotsUsed: z.number().int().min(0),
  resourcesUsed: z.record(z.string(), z.number().int().min(0)),
  grantUsesUsed: z.record(z.string(), z.number().int().min(0)),
  toggles: z.array(z.string()),
  conditions: z.array(conditionSchema),
  exhaustion: z.number().int().min(0).max(6),
  concentration: z.strictObject({ spellKey: contentKeySchema, sinceIso: z.string() }).optional(),
  inspiration: z.boolean(),
  xp: z.number().int().min(0),
  currency: currencySchema,
  inventory: z.array(inventoryItemSchema).max(1000),
  prepared: z.record(z.string(), z.array(contentKeySchema)),
});
export type CharacterState = z.infer<typeof characterStateSchema>;
export type Currency = z.infer<typeof currencySchema>;

// ─── Команды игрового состояния (SPEC §8.10) ─────────────────────────────

const hitDie = z.union([z.literal(6), z.literal(8), z.literal(10), z.literal(12)]);

export const stateCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('damage'),
    amount: z.number().int().min(0).max(100000),
    damageType: damageTypeSchema.optional(),
    critical: z.boolean().optional(),
    magical: z.boolean().optional(),
  }),
  z.strictObject({ type: z.literal('heal'), amount: z.number().int().min(0).max(100000) }),
  z.strictObject({ type: z.literal('set_temp_hp'), amount: z.number().int().min(0).max(100000) }),
  z.strictObject({ type: z.literal('set_hp'), current: z.number().int().min(0).max(100000) }),
  z.strictObject({ type: z.literal('death_save'), result: z.enum(['success', 'failure', 'nat1', 'nat20']) }),
  z.strictObject({ type: z.literal('spend_slot'), level: z.number().int().min(1).max(9), pact: z.boolean().optional() }),
  z.strictObject({ type: z.literal('restore_slot'), level: z.number().int().min(1).max(9), pact: z.boolean().optional() }),
  z.strictObject({ type: z.literal('use_resource'), id: z.string().min(1), amount: z.number().int().min(1).optional() }),
  z.strictObject({ type: z.literal('restore_resource'), id: z.string().min(1), amount: z.number().int().min(1).optional() }),
  z.strictObject({ type: z.literal('use_grant'), id: z.string().min(1) }),
  z.strictObject({ type: z.literal('set_toggle'), id: z.string().min(1), on: z.boolean() }),
  z.strictObject({ type: z.literal('add_condition'), condition: conditionSchema }),
  z.strictObject({ type: z.literal('remove_condition'), condition: conditionSchema }),
  z.strictObject({ type: z.literal('set_exhaustion'), level: z.number().int().min(0).max(6) }),
  z.strictObject({ type: z.literal('concentrate'), spellKey: contentKeySchema }),
  z.strictObject({ type: z.literal('drop_concentration') }),
  z.strictObject({
    type: z.literal('short_rest'),
    hitDice: z.array(z.strictObject({ die: hitDie, roll: z.number().int().min(1).max(12) })).max(20),
  }),
  z.strictObject({ type: z.literal('long_rest') }),
  z.strictObject({ type: z.literal('new_day') }),
  z.strictObject({ type: z.literal('gain_xp'), amount: z.number().int().min(-10000000).max(10000000) }),
  z.strictObject({ type: z.literal('set_xp'), xp: z.number().int().min(0).max(10000000) }),
  z.strictObject({ type: z.literal('set_currency'), currency: currencySchema }),
  z.strictObject({ type: z.literal('add_currency'), currency: currencySchema.partial() }),
  z.strictObject({ type: z.literal('inventory_add'), item: inventoryItemSchema.omit({ id: true }) }),
  z.strictObject({ type: z.literal('inventory_update'), id: z.string().min(1), patch: inventoryItemSchema.omit({ id: true }).partial() }),
  z.strictObject({ type: z.literal('inventory_remove'), id: z.string().min(1), qty: z.number().int().min(1).optional() }),
  z.strictObject({ type: z.literal('set_prepared'), classKey: contentKeySchema, spells: z.array(contentKeySchema).max(100) }),
  z.strictObject({ type: z.literal('set_inspiration'), value: z.boolean() }),
  z.strictObject({ type: z.literal('set_charges'), id: z.string().min(1), charges: z.number().int().min(0).max(1000) }),
]);
export type StateCommand = z.infer<typeof stateCommandSchema>;

export const EMPTY_ABILITIES: Record<Ability, number> = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };

export function emptyBuild(name = ''): CharacterBuild {
  return {
    schemaVersion: 1,
    status: 'draft',
    identity: { name, personality: { traits: '', ideals: '', bonds: '', flaws: '' } },
    abilities: { method: 'standard_array', base: { ...EMPTY_ABILITIES } },
    race: '',
    background: '',
    classes: [],
    levels: [],
    choices: {},
    knownSpells: [],
    manualEffects: [],
    overrides: {},
  };
}

export function emptyState(): CharacterState {
  return {
    hp: { current: 0, temp: 0 },
    hitDiceUsed: { d6: 0, d8: 0, d10: 0, d12: 0 },
    deathSaves: { successes: 0, failures: 0, stable: false, dead: false },
    slotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    pactSlotsUsed: 0,
    resourcesUsed: {},
    grantUsesUsed: {},
    toggles: [],
    conditions: [],
    exhaustion: 0,
    inspiration: false,
    xp: 0,
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    inventory: [],
    prepared: {},
  };
}
