import type {
  Ability,
  CampaignSettings,
  CharacterBuild,
  CharacterState,
  ChoiceSource,
  ConditionId,
  ContentKey,
  DamageType,
  Effect,
  Size,
  SkillId,
} from '@ps/content-schema';

export type {
  Ability,
  CampaignSettings,
  CharacterBuild,
  CharacterState,
  ConditionId,
  ContentKey,
  DamageType,
  Effect,
  Size,
  SkillId,
};

// ─── Значения с расшифровкой (SPEC §8.3) ─────────────────────────────────

export type ValPart = { labelRu: string; sourceKey?: string; value: number };
export type Val = {
  value: number;
  parts: ValPart[];
  overridden?: { computed: number; reasonRu: string };
};

export type RollModeInfo = {
  mode: 'advantage' | 'disadvantage';
  target: string;
  noteRu: string;
  /** true — подсказка у броска; false — действует всегда (влияет на пассивные значения). */
  conditional: boolean;
  sourceKey?: string;
  sourceLabelRu: string;
};

export type DefenseLine = {
  damageType: DamageType | 'nonmagical_bps';
  noteRu?: string;
  sourceKey?: string;
  sourceLabelRu: string;
};

export type DamageLine = { dice: string; bonus: number; type: DamageType; labelRu?: string };

export type AttackLine = {
  id: string;
  nameRu: string;
  kind: 'weapon' | 'unarmed' | 'effect' | 'spell';
  itemId?: string;
  spellKey?: string;
  spellLevel?: number;
  ability?: Ability;
  proficient: boolean;
  toHit?: Val;
  saveDc?: Val;
  saveAbility?: Ability;
  damage: DamageLine[];
  reachFt?: number;
  rangeFt?: { normal: number; long: number };
  properties: string[];
  notes: string[];
  modes: RollModeInfo[];
  bonusAction?: boolean;
};

export type Issue = { severity: 'error' | 'warning'; code: string; messageRu: string; path?: string };

export type ChoiceOption = { value: string; labelRu: string; disabled?: boolean; hintRu?: string };

/** Описание выбора (сделанного или нет) для конструктора и листа. */
export type ChoiceInfo = {
  key: string;
  kind: 'choice' | 'subclass' | 'asi' | 'spells' | 'spellbook' | 'hp';
  labelRu: string;
  sourceKey: string;
  sourceLabelRu: string;
  featureKey?: string;
  choose: number;
  selected: string[];
  source?: ChoiceSource;
  options: ChoiceOption[];
  /** Для выборов уровня (ASI, подкласс, хиты): индекс в `build.levels`. */
  levelIndex?: number;
  classKey?: string;
};

export type PendingChoice = ChoiceInfo;

export type ProfLevel = 'none' | 'half' | 'proficient' | 'expertise';

export type SpellEntry = {
  key: ContentKey;
  nameRu: string;
  level: number;
  prepared: boolean;
  alwaysPrepared: boolean;
  ritual: boolean;
  concentration: boolean;
  source: 'cantrip' | 'known' | 'spellbook' | 'always' | 'grant';
};

export type SpellcastingClass = {
  classKey: ContentKey;
  nameRu: string;
  ability: Ability;
  dc: Val;
  attack: Val;
  cantripsMax?: number;
  knownMax?: number;
  preparedMax?: number;
  spellbookFree?: number;
  maxSpellLevel: number;
  ritual: string;
  preparation: 'known' | 'prepared' | 'spellbook';
  progression: 'full' | 'half' | 'half_up' | 'third' | 'pact';
  spellListKey: string;
  schoolRestriction?: { schools: string[]; freePicksAtLevels: number[] };
  spells: SpellEntry[];
};

export type ComputedSheet = {
  engineVersion: string;
  identity: { name: string; raceLabelRu: string; classLabelRu: string; backgroundLabelRu: string };
  level: { total: number; byClass: Record<ContentKey, number> };
  pb: Val;
  abilities: Record<Ability, { score: Val; mod: number; save: Val; saveProficient: boolean; autoFail: boolean; modes: RollModeInfo[] }>;
  skills: Record<SkillId, { ability: Ability; value: Val; prof: ProfLevel; modes: RollModeInfo[] }>;
  passives: { perception: Val; investigation: Val; insight: Val };
  initiative: Val;
  ac: Val & { formulaLabelRu: string };
  speed: Partial<Record<'walk' | 'fly' | 'swim' | 'climb' | 'burrow', Val>>;
  size: Size;
  senses: { sense: string; rangeFt: number }[];
  hp: { max: Val; current: number; temp: number };
  hitDice: { die: 6 | 8 | 10 | 12; total: number; used: number }[];
  defenses: {
    resistances: DefenseLine[];
    immunities: DefenseLine[];
    vulnerabilities: DefenseLine[];
    conditionImmunities: ConditionId[];
  };
  rollModes: RollModeInfo[];
  proficiencies: { armor: string[]; weapons: string[]; tools: string[]; languages: string[] };
  attacks: AttackLine[];
  attacksPerAction: number;
  critMin: number;
  resources: { id: string; nameRu: string; max: number; used: number; reset: string; die?: string; sourceLabelRu: string }[];
  toggles: {
    id: string;
    labelRu: string;
    active: boolean;
    cost?: { resource: string; amount: number };
    exclusiveGroup?: string;
    sourceLabelRu: string;
  }[];
  spellcasting: {
    classes: SpellcastingClass[];
    slots: { level: number; max: number; used: number }[];
    pact?: { level: number; max: number; used: number };
    grants: {
      id: string;
      spellKey: ContentKey;
      nameRu: string;
      mode: string;
      ability?: Ability;
      castAtLevel?: number;
      uses?: { max: number; used: number; reset: string };
      sourceLabelRu: string;
    }[];
    casterLevel: number;
  };
  carrying: {
    weightLb: number;
    capacityLb: number;
    pushDragLiftLb: number;
    status: 'ok' | 'encumbered' | 'heavily_encumbered' | 'over_capacity';
  };
  features: {
    sourceKey: ContentKey;
    sourceLabelRu: string;
    features: {
      key: string;
      nameRu: string;
      level?: number;
      textMd?: string;
      automated: 'complete' | 'partial' | 'text_only';
      notes: string[];
    }[];
  }[];
  choices: ChoiceInfo[];
  pendingChoices: PendingChoice[];
  issues: Issue[];
  xp: { current: number; nextLevelAt: number | null; canLevelUp: boolean };
  status: {
    conditions: ConditionId[];
    exhaustion: number;
    concentration?: { spellKey: ContentKey; nameRu: string };
    inspiration: boolean;
    deathSaves: CharacterState['deathSaves'];
    dead: boolean;
    unconscious: boolean;
  };
};

export type SheetSummary = {
  engineVersion: string;
  name: string;
  raceLabelRu: string;
  classLabelRu: string;
  level: number;
  hp: { max: number; current: number; temp: number };
  ac: number;
  initiative: number;
  speedWalk: number;
  pb: number;
  passives: { perception: number; insight: number; investigation: number };
  saves: Record<Ability, number>;
  spellDcs: { classKey: string; nameRu: string; dc: number }[];
  slots: { level: number; max: number; used: number }[];
  pact?: { level: number; max: number; used: number };
  conditions: ConditionId[];
  exhaustion: number;
  concentration?: string;
  inspiration: boolean;
  xp: { current: number; nextLevelAt: number | null; canLevelUp: boolean };
  pendingChoices: number;
  dead: boolean;
};

export type EngineEvent =
  | { type: 'concentration_check'; dc: number; spellKey: string }
  | { type: 'dropped_to_zero' }
  | { type: 'died'; reason: 'massive_damage' | 'death_saves' | 'exhaustion' }
  | { type: 'stabilized' }
  | { type: 'revived' }
  | { type: 'concentration_ended'; spellKey: string }
  | { type: 'level_up_available' };

export class CommandError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CommandError';
  }
}

// ─── Повышение уровня ─────────────────────────────────────────────────────

export type LevelUpClassOption = {
  classKey: ContentKey;
  nameRu: string;
  isNew: boolean;
  currentLevel: number;
  newLevel: number;
  available: boolean;
  reasonRu?: string;
  hitDie: 6 | 8 | 10 | 12;
  hpAverage: number;
  features: { key: string; nameRu: string; textMd: string }[];
  needsSubclass: boolean;
  subclasses: { key: ContentKey; nameRu: string }[];
  asi: boolean;
  spells?: {
    cantripsGain: number;
    knownGain: number;
    spellbookGain: number;
    canReplaceKnown: boolean;
    maxSpellLevel: number;
  };
};

export type LevelUpOptions = {
  currentLevel: number;
  nextLevel: number;
  canLevelUp: boolean;
  reasonRu?: string;
  hpMethods: ('average' | 'roll')[];
  classes: LevelUpClassOption[];
  featsAllowed: boolean;
};

export type LevelUpDecision = {
  classKey: ContentKey;
  hp: { method: 'average' | 'roll' | 'max'; roll?: number };
  subclassKey?: ContentKey;
  asi?: { kind: 'asi'; increases: Partial<Record<Ability, 1 | 2>> } | { kind: 'feat'; featKey: ContentKey };
  choices?: Record<string, string[]>;
  spells?: { cantrips?: ContentKey[]; spells?: ContentKey[]; spellbook?: ContentKey[]; replace?: { from: ContentKey; to: ContentKey } };
};
