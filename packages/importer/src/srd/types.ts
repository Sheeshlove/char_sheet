/** Минимальные типы исходных JSON 5e-database (данные 2014) — только используемые поля. */

export type Ref = { index: string; name: string; url?: string };

export type OptionSet = {
  option_set_type: 'options_array' | 'equipment_category' | 'resource_list';
  options?: Option[];
  equipment_category?: Ref;
  resource_list_url?: string;
};

export type Option =
  | { option_type: 'reference'; item: Ref }
  | { option_type: 'counted_reference'; count: number; of: Ref; prerequisites?: unknown[] }
  | { option_type: 'choice'; choice: Choice }
  | { option_type: 'multiple'; items: Option[] }
  | { option_type: 'string'; string: string }
  | { option_type: 'ideal'; desc: string }
  | { option_type: 'ability_bonus'; ability_score: Ref; bonus: number }
  | { option_type: 'score_prerequisite'; ability_score: Ref; minimum_score: number };

export type Choice = { desc?: string; choose: number; type?: string; from: OptionSet };

export type Cost = { quantity: number; unit: 'cp' | 'sp' | 'ep' | 'gp' | 'pp' };

export type SrdEquipment = {
  index: string;
  name: string;
  equipment_category: Ref;
  gear_category?: Ref;
  weapon_category?: 'Simple' | 'Martial';
  weapon_range?: 'Melee' | 'Ranged';
  cost?: Cost;
  damage?: { damage_dice: string; damage_type: Ref };
  two_handed_damage?: { damage_dice: string; damage_type: Ref };
  range?: { normal: number; long?: number };
  throw_range?: { normal: number; long: number };
  weight?: number;
  properties?: Ref[];
  armor_category?: 'Light' | 'Medium' | 'Heavy' | 'Shield';
  armor_class?: { base: number; dex_bonus: boolean; max_bonus?: number };
  str_minimum?: number;
  stealth_disadvantage?: boolean;
  tool_category?: string;
  vehicle_category?: string;
  quantity?: number;
  contents?: { item: Ref; quantity: number }[];
  capacity?: string;
  desc?: string[];
  speed?: { quantity: number; unit: string };
};

export type SrdMagicItem = {
  index: string;
  name: string;
  equipment_category: Ref;
  rarity: { name: string };
  variants?: Ref[];
  variant?: boolean;
  desc: string[];
};

export type SrdSpell = {
  index: string;
  name: string;
  desc: string[];
  higher_level?: string[];
  range: string;
  components: ('V' | 'S' | 'M')[];
  material?: string;
  ritual: boolean;
  duration: string;
  concentration: boolean;
  casting_time: string;
  level: number;
  attack_type?: 'melee' | 'ranged';
  damage?: SrdSpellDamage | SrdSpellDamage[];
  heal_at_slot_level?: Record<string, string>;
  dc?: { dc_type: Ref; dc_success?: string };
  school: Ref;
  classes: Ref[];
  subclasses: Ref[];
};

export type SrdSpellDamage = {
  damage_type?: Ref;
  damage_at_slot_level?: Record<string, string>;
  damage_at_character_level?: Record<string, string>;
};

export type SrdClass = {
  index: string;
  name: string;
  hit_die: 6 | 8 | 10 | 12;
  proficiency_choices: Choice[];
  proficiencies: Ref[];
  saving_throws: Ref[];
  starting_equipment: { equipment: Ref; quantity: number }[];
  starting_equipment_options: Choice[];
  multi_classing: {
    prerequisites?: { ability_score: Ref; minimum_score: number }[];
    prerequisite_options?: Choice;
    proficiencies?: Ref[];
    proficiency_choices?: Choice[];
  };
  spellcasting?: { level: number; spellcasting_ability: Ref };
};

export type SrdLevel = {
  index: string;
  level: number;
  ability_score_bonuses?: number;
  prof_bonus?: number;
  features: Ref[];
  spellcasting?: Record<string, number>;
  class_specific?: Record<string, unknown>;
  class: Ref;
  subclass?: Ref;
};

export type SrdFeature = {
  index: string;
  name: string;
  level: number;
  class: Ref;
  subclass?: Ref;
  parent?: Ref;
  desc: string[];
  feature_specific?: {
    subfeature_options?: Choice;
    expertise_options?: Choice;
    invocations?: Ref[];
    enemy_type_options?: Choice;
    terrain_type_options?: Choice;
  };
};

export type SrdSubclass = {
  index: string;
  name: string;
  class: Ref;
  subclass_flavor: string;
  desc: string[];
  spells?: { prerequisites: { index: string; type: string }[]; spell: Ref }[];
};

export type SrdRace = {
  index: string;
  name: string;
  speed: number;
  ability_bonuses: { ability_score: Ref; bonus: number }[];
  ability_bonus_options?: Choice;
  alignment: string;
  age: string;
  size: 'Tiny' | 'Small' | 'Medium' | 'Large';
  size_description: string;
  languages: Ref[];
  language_options?: Choice;
  language_desc: string;
  traits: Ref[];
  subraces: Ref[];
  starting_proficiencies?: Ref[];
  starting_proficiency_options?: Choice;
};

export type SrdSubrace = {
  index: string;
  name: string;
  race: Ref;
  desc: string;
  ability_bonuses: { ability_score: Ref; bonus: number }[];
  racial_traits: Ref[];
  starting_proficiencies?: Ref[];
  language_options?: Choice;
};

export type SrdTrait = {
  index: string;
  name: string;
  desc: string[];
  races: Ref[];
  subraces: Ref[];
  parent?: Ref;
  proficiencies: Ref[];
  proficiency_choices?: Choice;
  language_options?: Choice;
  trait_specific?: {
    spell_options?: Choice;
    subtrait_options?: Choice;
    damage_type?: Ref;
    breath_weapon?: unknown;
  };
};

export type SrdProficiency = {
  index: string;
  type: string;
  name: string;
  reference: Ref;
};

export type SrdBackground = {
  index: string;
  name: string;
  starting_proficiencies: Ref[];
  language_options?: Choice;
  starting_equipment: { equipment: Ref; quantity: number }[];
  starting_equipment_options?: Choice[];
  starting_gold?: Cost;
  feature: { name: string; desc: string[] };
  personality_traits: Choice;
  ideals: Choice;
  bonds: Choice;
  flaws: Choice;
};

export type SrdFeat = {
  index: string;
  name: string;
  prerequisites: { ability_score: Ref; minimum_score: number }[];
  desc: string[];
};

export type SrdCondition = { index: string; name: string; desc: string[] };

export type SrdLanguage = {
  index: string;
  name: string;
  type: string;
  typical_speakers?: string[];
  script?: string;
  desc?: string;
};

export type SrdData = {
  equipment: SrdEquipment[];
  magicItems: SrdMagicItem[];
  spells: SrdSpell[];
  classes: SrdClass[];
  levels: SrdLevel[];
  features: SrdFeature[];
  subclasses: SrdSubclass[];
  races: SrdRace[];
  subraces: SrdSubrace[];
  traits: SrdTrait[];
  proficiencies: SrdProficiency[];
  backgrounds: SrdBackground[];
  feats: SrdFeat[];
  conditionsEn: SrdCondition[];
  conditionsRu: SrdCondition[];
  languagesEn: SrdLanguage[];
  languagesRu: SrdLanguage[];
};
