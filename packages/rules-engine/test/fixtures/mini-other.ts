import type { ArmorData, ContentEntity, Effect, GearData, SpellData, WeaponData } from '@ps/content-schema';
import { abilityAdd, entity, feat, k, prof, skillsChoice, text } from './mini-helpers';

// ─── Расы ─────────────────────────────────────────────────────────────────

const languages = (...slugs: string[]) => slugs.map((s) => prof(`language:${s}`));
const extraLanguage: Effect = { type: 'choice', id: 'language', labelRu: 'Дополнительный язык', choose: 1, options: { kind: 'languages' } };

export const human = entity('race', 'human', 'Человек', {
  size: 'medium',
  speed: { walk: 30 },
  subraceRequired: false,
  features: [
    feat('asi', 'Увеличение характеристик', undefined, ['str', 'dex', 'con', 'int', 'wis', 'cha'].map((a) => abilityAdd(a as 'str', 1))),
    feat('languages', 'Языки', undefined, [...languages('common'), extraLanguage]),
  ],
});

export const dwarf = entity('race', 'dwarf', 'Дварф', {
  size: 'medium',
  speed: { walk: 25 },
  subraceRequired: true,
  features: [
    feat('asi', 'Увеличение характеристик', undefined, [abilityAdd('con', 2)]),
    feat('speed', 'Скорость', undefined, [{ type: 'armor_rule', category: 'heavy', ignoreStrSpeedPenalty: true }]),
    feat('darkvision', 'Тёмное зрение', undefined, [{ type: 'sense', sense: 'darkvision', rangeFt: 60, op: 'set_max' }]),
    feat('dwarven-resilience', 'Дварфская устойчивость', undefined, [
      { type: 'roll_mode', mode: 'advantage', target: 'save:*', noteRu: 'Против яда' },
      { type: 'defense', kind: 'resistance', damageType: 'poison' },
    ]),
    feat('dwarven-combat-training', 'Дварфская боевая тренировка', undefined, [
      prof('weapon:battleaxe'),
      prof('weapon:handaxe'),
      prof('weapon:light-hammer'),
      prof('weapon:warhammer'),
    ]),
    feat('tool-proficiency', 'Владение инструментами', undefined, [
      {
        type: 'choice',
        id: 'tool',
        labelRu: 'Инструменты ремесленника',
        choose: 1,
        options: {
          kind: 'list',
          items: [
            { value: 'smiths-tools', labelRu: 'Инструменты кузнеца', effects: [prof('tool:smiths-tools')] },
            { value: 'brewers-supplies', labelRu: 'Инструменты пивовара', effects: [prof('tool:brewers-supplies')] },
            { value: 'masons-tools', labelRu: 'Инструменты каменщика', effects: [prof('tool:masons-tools')] },
          ],
        },
      },
    ]),
    feat('stonecunning', 'Знание камня', undefined, [text('Двойной бонус мастерства к проверкам Истории, связанным с камнем')]),
    feat('languages', 'Языки', undefined, languages('common', 'dwarvish')),
  ],
});

export const hillDwarf = entity('subrace', 'hill-dwarf', 'Холмовой дварф', {
  raceKey: k('race', 'dwarf'),
  features: [
    feat('asi', 'Увеличение характеристик', undefined, [abilityAdd('wis', 1)]),
    feat('dwarven-toughness', 'Дварфская выдержка', undefined, [{ type: 'hp_max', value: 'LEVEL' }]),
  ],
});

export const elf = entity('race', 'elf', 'Эльф', {
  size: 'medium',
  speed: { walk: 30 },
  subraceRequired: true,
  features: [
    feat('asi', 'Увеличение характеристик', undefined, [abilityAdd('dex', 2)]),
    feat('darkvision', 'Тёмное зрение', undefined, [{ type: 'sense', sense: 'darkvision', rangeFt: 60, op: 'set_max' }]),
    feat('keen-senses', 'Обострённые чувства', undefined, [prof('skill:perception')]),
    feat('fey-ancestry', 'Наследие фей', undefined, [
      { type: 'roll_mode', mode: 'advantage', target: 'save:*', noteRu: 'Против очарования' },
      text('Магия не может усыпить'),
    ]),
    feat('trance', 'Транс', undefined, [text()]),
    feat('languages', 'Языки', undefined, languages('common', 'elvish')),
  ],
});

export const highElf = entity('subrace', 'high-elf', 'Высший эльф', {
  raceKey: k('race', 'elf'),
  features: [
    feat('asi', 'Увеличение характеристик', undefined, [abilityAdd('int', 1)]),
    feat('elf-weapon-training', 'Владение эльфийским оружием', undefined, [
      prof('weapon:longsword'),
      prof('weapon:shortsword'),
      prof('weapon:shortbow'),
      prof('weapon:longbow'),
    ]),
    feat('cantrip', 'Заговор', undefined, [
      { type: 'choice', id: 'cantrip', labelRu: 'Заговор волшебника', choose: 1, options: { kind: 'spells', list: 'wizard', level: 'cantrip' } },
      { type: 'spell_grant', spell: { choice: 'cantrip' }, ability: 'int', mode: 'known' },
    ]),
    feat('extra-language', 'Дополнительный язык', undefined, [extraLanguage]),
  ],
});

export const halfling = entity('race', 'halfling', 'Полурослик', {
  size: 'small',
  speed: { walk: 25 },
  subraceRequired: true,
  features: [
    feat('asi', 'Увеличение характеристик', undefined, [abilityAdd('dex', 2)]),
    feat('lucky', 'Везучий', undefined, [text('Перебросить 1 на к20 при атаке, проверке или спасброске')]),
    feat('brave', 'Храбрый', undefined, [{ type: 'roll_mode', mode: 'advantage', target: 'save:*', noteRu: 'Против испуга' }]),
    feat('halfling-nimbleness', 'Проворство полуросликов', undefined, [text()]),
    feat('languages', 'Языки', undefined, languages('common', 'halfling')),
  ],
});

export const lightfoot = entity('subrace', 'lightfoot', 'Легконогий', {
  raceKey: k('race', 'halfling'),
  features: [
    feat('asi', 'Увеличение характеристик', undefined, [abilityAdd('cha', 1)]),
    feat('naturally-stealthy', 'Естественная скрытность', undefined, [text('Можно прятаться за существом крупнее на размер')]),
  ],
});

export const tortle = entity(
  'race',
  'tortle',
  'Черепахид',
  {
    size: 'medium',
    speed: { walk: 30 },
    subraceRequired: false,
    features: [
      feat('asi', 'Увеличение характеристик', undefined, [
        {
          type: 'choice',
          id: 'asi',
          labelRu: 'Увеличение характеристик',
          choose: 3,
          options: { kind: 'ability_increase', points: 3, maxPerAbility: 2 },
        },
      ]),
      feat('claws', 'Когти', undefined, [
        {
          type: 'attack',
          id: 'claws',
          nameRu: 'Когти',
          ability: 'str',
          proficient: true,
          damage: [{ dice: '1d6', type: 'slashing', addAbilityMod: true }],
          reachFt: 5,
        },
      ]),
      feat('natural-armor', 'Природный доспех', undefined, [
        { type: 'ac_formula', id: 'tortle-shell', labelRu: 'Природный доспех', base: '17', allowShield: true, requires: 'no_armor' },
        text('Не может носить лёгкие, средние и тяжёлые доспехи'),
      ]),
      feat('hold-breath', 'Задержка дыхания', undefined, [text()]),
      feat('natures-intuition', 'Природная интуиция', undefined, [
        skillsChoice('skill', 'Навык', 1, ['animal_handling', 'medicine', 'nature', 'perception', 'stealth', 'survival']),
      ]),
      feat('shell-defense', 'Защита панцирем', undefined, [
        {
          type: 'toggle',
          id: 'shell-defense',
          labelRu: 'Укрылся в панцире',
          effects: [
            { type: 'bonus', target: 'ac', value: '4', labelRu: 'Защита панцирем' },
            { type: 'speed', mode: 'all', op: 'zero' },
            { type: 'roll_mode', mode: 'advantage', target: 'save:str', noteRu: 'В панцире' },
            { type: 'roll_mode', mode: 'advantage', target: 'save:con', noteRu: 'В панцире' },
            { type: 'roll_mode', mode: 'disadvantage', target: 'save:dex', noteRu: 'В панцире' },
          ],
        },
      ]),
    ],
  },
  'Tortle',
);

// ─── Предыстории ──────────────────────────────────────────────────────────

const noCharacteristics = { traits: [], ideals: [], bonds: [], flaws: [] };

export const acolyte = entity('background', 'acolyte', 'Прислужник', {
  skills: ['insight', 'religion'],
  tools: [],
  languages: { choose: 2 },
  equipmentMd: '',
  gold: 15,
  feature: feat('shelter-of-the-faithful', 'Приют для верующих', undefined, [text()]),
  characteristics: noCharacteristics,
});

export const soldier = entity('background', 'soldier', 'Солдат', {
  skills: ['athletics', 'intimidation'],
  tools: ['choice:1:gaming', 'vehicles-land'],
  languages: [],
  equipmentMd: '',
  gold: 10,
  feature: feat('military-rank', 'Воинское звание', undefined, [text()]),
  characteristics: noCharacteristics,
});

export const criminal = entity('background', 'criminal', 'Преступник', {
  skills: ['deception', 'stealth'],
  tools: ['thieves-tools', 'choice:1:gaming'],
  languages: [],
  equipmentMd: '',
  gold: 15,
  feature: feat('criminal-contact', 'Криминальные связи', undefined, [text()]),
  characteristics: noCharacteristics,
});

// ─── Черты ────────────────────────────────────────────────────────────────

export const tough = entity('feat', 'tough', 'Крепкий', {
  repeatable: false,
  features: [feat('tough', 'Крепкий', undefined, [{ type: 'hp_max', value: '2 * LEVEL' }])],
});

export const alert = entity('feat', 'alert', 'Бдительный', {
  repeatable: false,
  features: [
    feat('alert', 'Бдительный', undefined, [
      { type: 'bonus', target: 'initiative', value: '5', labelRu: 'Бдительный' },
      text('Нельзя застать врасплох; скрытые существа не получают преимущества'),
    ]),
  ],
});

export const observant = entity('feat', 'observant', 'Наблюдательный', {
  repeatable: false,
  features: [
    feat('observant', 'Наблюдательный', undefined, [
      {
        type: 'choice',
        id: 'asi',
        labelRu: 'Увеличение характеристики',
        choose: 1,
        options: { kind: 'ability_increase', points: 1, maxPerAbility: 1, abilities: ['int', 'wis'] },
      },
      { type: 'bonus', target: 'passive:perception', value: '5', labelRu: 'Наблюдательный' },
      { type: 'bonus', target: 'passive:investigation', value: '5', labelRu: 'Наблюдательный' },
    ]),
  ],
});

// ─── Снаряжение ───────────────────────────────────────────────────────────

const armor = (slug: string, nameRu: string, d: ArmorData) => entity('armor', slug, nameRu, d);
const A = (category: ArmorData['category'], baseAc: number, dexCap: number | null, costGp: number, weightLb: number, stealth = false, str?: number): ArmorData => ({
  category,
  baseAc,
  dexCap,
  stealthDisadvantage: stealth,
  costCp: costGp * 100,
  weightLb,
  ...(str ? { strRequirement: str } : {}),
});

const W = (
  category: WeaponData['category'],
  range: WeaponData['range'],
  dice: string,
  type: WeaponData['damage']['type'],
  properties: WeaponData['properties'],
  costCp: number,
  weightLb: number,
  extra: Partial<WeaponData> = {},
): WeaponData => ({
  category,
  range,
  damage: { dice, type },
  properties,
  costCp,
  weightLb,
  monkWeapon: false,
  ...extra,
});
const weapon = (slug: string, nameRu: string, d: WeaponData) => entity('weapon', slug, nameRu, d);

export const EQUIPMENT: ContentEntity[] = [
  armor('leather', 'Кожаный доспех', A('light', 11, null, 10, 10)),
  armor('studded-leather', 'Проклёпанный кожаный доспех', A('light', 12, null, 45, 13)),
  armor('chain-shirt', 'Кольчужная рубаха', A('medium', 13, 2, 50, 20)),
  armor('scale-mail', 'Чешуйчатый доспех', A('medium', 14, 2, 50, 45, true)),
  armor('half-plate', 'Полулаты', A('medium', 15, 2, 750, 40, true)),
  armor('chain-mail', 'Кольчуга', A('heavy', 16, 0, 75, 55, true, 13)),
  armor('splint', 'Наборный доспех', A('heavy', 17, 0, 200, 60, true, 15)),
  armor('plate', 'Латы', A('heavy', 18, 0, 1500, 65, true, 15)),
  armor('shield', 'Щит', A('shield', 2, null, 10, 6)),
  weapon('club', 'Дубинка', W('simple', 'melee', '1d4', 'bludgeoning', ['light'], 10, 2, { monkWeapon: true })),
  weapon('dagger', 'Кинжал', W('simple', 'melee', '1d4', 'piercing', ['finesse', 'light', 'thrown'], 200, 1, { monkWeapon: true, rangeFt: { normal: 20, long: 60 } })),
  weapon('handaxe', 'Ручной топор', W('simple', 'melee', '1d6', 'slashing', ['light', 'thrown'], 500, 2, { monkWeapon: true, rangeFt: { normal: 20, long: 60 } })),
  weapon('light-hammer', 'Лёгкий молот', W('simple', 'melee', '1d4', 'bludgeoning', ['light', 'thrown'], 200, 2, { monkWeapon: true, rangeFt: { normal: 20, long: 60 } })),
  weapon('mace', 'Булава', W('simple', 'melee', '1d6', 'bludgeoning', [], 500, 4, { monkWeapon: true })),
  weapon('quarterstaff', 'Боевой посох', W('simple', 'melee', '1d6', 'bludgeoning', ['versatile'], 20, 4, { monkWeapon: true, versatileDice: '1d8' })),
  weapon('spear', 'Копьё', W('simple', 'melee', '1d6', 'piercing', ['thrown', 'versatile'], 100, 3, { monkWeapon: true, versatileDice: '1d8', rangeFt: { normal: 20, long: 60 } })),
  weapon('light-crossbow', 'Лёгкий арбалет', W('simple', 'ranged', '1d8', 'piercing', ['ammunition', 'loading', 'two_handed'], 2500, 5, { rangeFt: { normal: 80, long: 320 } })),
  weapon('shortbow', 'Короткий лук', W('simple', 'ranged', '1d6', 'piercing', ['ammunition', 'two_handed'], 2500, 2, { rangeFt: { normal: 80, long: 320 } })),
  weapon('battleaxe', 'Боевой топор', W('martial', 'melee', '1d8', 'slashing', ['versatile'], 1000, 4, { versatileDice: '1d10' })),
  weapon('greataxe', 'Секира', W('martial', 'melee', '1d12', 'slashing', ['heavy', 'two_handed'], 3000, 7)),
  weapon('greatsword', 'Двуручный меч', W('martial', 'melee', '2d6', 'slashing', ['heavy', 'two_handed'], 5000, 6)),
  weapon('longsword', 'Длинный меч', W('martial', 'melee', '1d8', 'slashing', ['versatile'], 1500, 3, { versatileDice: '1d10' })),
  weapon('rapier', 'Рапира', W('martial', 'melee', '1d8', 'piercing', ['finesse'], 2500, 2)),
  weapon('shortsword', 'Короткий меч', W('martial', 'melee', '1d6', 'piercing', ['finesse', 'light'], 1000, 2, { monkWeapon: true })),
  weapon('warhammer', 'Боевой молот', W('martial', 'melee', '1d8', 'bludgeoning', ['versatile'], 1500, 2, { versatileDice: '1d10' })),
  weapon('longbow', 'Длинный лук', W('martial', 'ranged', '1d8', 'piercing', ['ammunition', 'heavy', 'two_handed'], 5000, 2, { rangeFt: { normal: 150, long: 600 } })),
  entity('gear', 'backpack', 'Рюкзак', { costCp: 200, weightLb: 5, capacityLb: 30, kind: 'gear' } satisfies GearData),
  entity('gear', 'iron-ingot', 'Железный слиток', { costCp: 10, weightLb: 1, kind: 'trade_good' } satisfies GearData),
  entity('tool', 'thieves-tools', 'Воровские инструменты', { costCp: 2500, weightLb: 1, kind: 'tool', toolGroup: 'other' }),
  entity('tool', 'tinkers-tools', 'Инструменты ремонтника', { costCp: 5000, weightLb: 10, kind: 'tool', toolGroup: 'artisan' }),
  entity('tool', 'smiths-tools', 'Инструменты кузнеца', { costCp: 2000, weightLb: 8, kind: 'tool', toolGroup: 'artisan' }),
  entity('tool', 'brewers-supplies', 'Инструменты пивовара', { costCp: 2000, weightLb: 9, kind: 'tool', toolGroup: 'artisan' }),
  entity('tool', 'masons-tools', 'Инструменты каменщика', { costCp: 1000, weightLb: 8, kind: 'tool', toolGroup: 'artisan' }),
  entity('tool', 'dice-set', 'Кости', { costCp: 10, weightLb: 0, kind: 'tool', toolGroup: 'gaming' }),
  entity('tool', 'lute', 'Лютня', { costCp: 3500, weightLb: 2, kind: 'tool', toolGroup: 'musical' }),
  entity('tool', 'flute', 'Флейта', { costCp: 200, weightLb: 1, kind: 'tool', toolGroup: 'musical' }),
  entity('tool', 'drum', 'Барабан', { costCp: 600, weightLb: 3, kind: 'tool', toolGroup: 'musical' }),
  entity('tool', 'vehicles-land', 'Наземный транспорт', { costCp: 0, weightLb: 0, kind: 'tool', toolGroup: 'other' }),
  ...[
    ['common', 'Общий', 'standard'],
    ['dwarvish', 'Дварфский', 'standard'],
    ['elvish', 'Эльфийский', 'standard'],
    ['halfling', 'Язык полуросликов', 'standard'],
    ['giant', 'Великаний', 'standard'],
    ['goblin', 'Гоблинский', 'standard'],
    ['orc', 'Орочий', 'standard'],
    ['draconic', 'Драконий', 'exotic'],
    ['infernal', 'Инфернальный', 'exotic'],
    ['celestial', 'Небесный', 'exotic'],
  ].map(([slug, nameRu, type]) => entity('language', slug!, nameRu!, { type: type as 'standard' })),
  entity('item', 'ring-of-protection', 'Кольцо защиты', {
    itemType: 'ring',
    rarity: 'rare',
    attunement: {},
    effects: [
      { type: 'bonus', target: 'ac', value: '1', labelRu: 'Кольцо защиты' },
      { type: 'bonus', target: 'save:*', value: '1', labelRu: 'Кольцо защиты' },
    ],
    effectsStatus: 'complete',
  }),
  entity('item', 'longsword-plus-1', 'Длинный меч +1', {
    itemType: 'weapon',
    baseItem: k('weapon', 'longsword'),
    rarity: 'uncommon',
    attunement: false,
    effects: [
      { type: 'bonus', target: 'attack:melee_weapon', value: '1' },
      { type: 'bonus', target: 'damage:melee_weapon', value: '1' },
    ],
    effectsStatus: 'complete',
  }),
  entity('item', 'belt-of-hill-giant-strength', 'Пояс силы холмового великана', {
    itemType: 'wondrous',
    rarity: 'rare',
    attunement: {},
    effects: [{ type: 'ability', ability: 'str', op: 'set_min', value: '21' }],
    effectsStatus: 'complete',
  }),
];

// ─── Заклинания ───────────────────────────────────────────────────────────

type SpellInput = Partial<SpellData> & Pick<SpellData, 'level' | 'school' | 'classes'>;
const spell = (slug: string, nameRu: string, d: SpellInput) =>
  entity('spell', slug, nameRu, {
    castingTime: { textRu: '1 действие', unit: 'action', amount: 1 },
    ritual: false,
    range: { textRu: '60 футов', feet: 60, kind: 'ranged' },
    components: { v: true, s: true, m: false },
    duration: { textRu: 'Мгновенная', concentration: false },
    subclasses: [],
    ...d,
  } as SpellData);

const conc = (textRu: string) => ({ textRu, concentration: true });

export const SPELLS: ContentEntity[] = [
  spell('fire-bolt', 'Огненный снаряд', {
    level: 0,
    school: 'evocation',
    classes: ['wizard', 'sorcerer', 'artificer'],
    attack: 'ranged',
    range: { textRu: '120 футов', feet: 120, kind: 'ranged' },
    damage: [{ dice: '1d10', type: 'fire', scaling: 'cantrip' }],
  }),
  spell('light', 'Свет', { level: 0, school: 'evocation', classes: ['wizard', 'sorcerer', 'cleric', 'bard', 'artificer'] }),
  spell('mage-hand', 'Волшебная рука', { level: 0, school: 'conjuration', classes: ['wizard', 'sorcerer', 'warlock', 'bard', 'artificer'] }),
  spell('prestidigitation', 'Фокусы', { level: 0, school: 'transmutation', classes: ['wizard', 'sorcerer', 'warlock', 'bard', 'artificer'] }),
  spell('minor-illusion', 'Малая иллюзия', { level: 0, school: 'illusion', classes: ['wizard', 'sorcerer', 'warlock', 'bard'] }),
  spell('guidance', 'Указание', { level: 0, school: 'divination', classes: ['cleric', 'druid', 'artificer'], duration: conc('Концентрация, вплоть до 1 минуты') }),
  spell('sacred-flame', 'Священное пламя', {
    level: 0,
    school: 'evocation',
    classes: ['cleric'],
    save: 'dex',
    damage: [{ dice: '1d8', type: 'radiant', scaling: 'cantrip' }],
  }),
  spell('thaumaturgy', 'Чудотворство', { level: 0, school: 'transmutation', classes: ['cleric'] }),
  spell('eldritch-blast', 'Мистический заряд', {
    level: 0,
    school: 'evocation',
    classes: ['warlock'],
    attack: 'ranged',
    range: { textRu: '120 футов', feet: 120, kind: 'ranged' },
    damage: [{ dice: '1d10', type: 'force' }],
  }),
  spell('vicious-mockery', 'Злая насмешка', {
    level: 0,
    school: 'enchantment',
    classes: ['bard'],
    save: 'wis',
    damage: [{ dice: '1d4', type: 'psychic', scaling: 'cantrip' }],
  }),
  spell('shocking-grasp', 'Электрошок', {
    level: 0,
    school: 'evocation',
    classes: ['wizard', 'sorcerer', 'artificer'],
    attack: 'melee',
    range: { textRu: 'Касание', kind: 'touch' },
    damage: [{ dice: '1d8', type: 'lightning', scaling: 'cantrip' }],
  }),
  spell('mage-armor', 'Доспехи мага', {
    level: 1,
    school: 'abjuration',
    classes: ['wizard', 'sorcerer'],
    range: { textRu: 'Касание', kind: 'touch' },
    duration: { textRu: '8 часов', concentration: false },
    components: { v: true, s: true, m: true, materialRu: 'кусочек выделанной кожи' },
    selfEffects: [{ type: 'ac_formula', id: 'mage-armor', labelRu: 'Доспехи мага', base: '13 + DEX', allowShield: true, requires: 'no_armor' }],
  }),
  spell('shield', 'Щит', {
    level: 1,
    school: 'abjuration',
    classes: ['wizard', 'sorcerer'],
    castingTime: { textRu: '1 реакция', unit: 'reaction', amount: 1 },
    range: { textRu: 'На себя', kind: 'self' },
    duration: { textRu: '1 раунд', concentration: false },
    selfEffects: [{ type: 'bonus', target: 'ac', value: '5', labelRu: 'Щит' }],
  }),
  spell('magic-missile', 'Волшебная стрела', { level: 1, school: 'evocation', classes: ['wizard', 'sorcerer'] }),
  spell('burning-hands', 'Огненные ладони', {
    level: 1,
    school: 'evocation',
    classes: ['wizard', 'sorcerer'],
    save: 'dex',
    damage: [{ dice: '3d6', type: 'fire', scaling: 'slot' }],
    range: { textRu: 'На себя (конус 15 футов)', kind: 'self' },
  }),
  spell('thunderwave', 'Волна грома', {
    level: 1,
    school: 'evocation',
    classes: ['wizard', 'sorcerer', 'bard'],
    save: 'con',
    damage: [{ dice: '2d8', type: 'thunder', scaling: 'slot' }],
  }),
  spell('sleep', 'Усыпление', { level: 1, school: 'enchantment', classes: ['wizard', 'sorcerer', 'bard'] }),
  spell('detect-magic', 'Обнаружение магии', {
    level: 1,
    school: 'divination',
    classes: ['wizard', 'sorcerer', 'cleric', 'bard', 'paladin', 'ranger', 'artificer'],
    ritual: true,
    duration: conc('Концентрация, вплоть до 10 минут'),
  }),
  spell('find-familiar', 'Поиск фамильяра', { level: 1, school: 'conjuration', classes: ['wizard'], ritual: true }),
  spell('identify', 'Опознание', { level: 1, school: 'divination', classes: ['wizard', 'bard', 'artificer'], ritual: true }),
  spell('cure-wounds', 'Лечение ран', {
    level: 1,
    school: 'evocation',
    classes: ['cleric', 'bard', 'paladin', 'ranger', 'artificer'],
    heal: { dice: '1d8', addSpellMod: true, scaling: 'slot' },
  }),
  spell('healing-word', 'Лечащее слово', { level: 1, school: 'evocation', classes: ['cleric', 'bard'] }),
  spell('bless', 'Благословение', { level: 1, school: 'enchantment', classes: ['cleric', 'paladin'], duration: conc('Концентрация, вплоть до 1 минуты') }),
  spell('command', 'Приказ', { level: 1, school: 'enchantment', classes: ['cleric', 'paladin'] }),
  spell('hunters-mark', 'Метка охотника', { level: 1, school: 'divination', classes: ['ranger'], duration: conc('Концентрация, вплоть до 1 часа') }),
  spell('hex', 'Сглаз', { level: 1, school: 'enchantment', classes: ['warlock'], duration: conc('Концентрация, вплоть до 1 часа') }),
  spell('armor-of-agathys', 'Доспех Агатиса', { level: 1, school: 'abjuration', classes: ['warlock'] }),
  spell('lesser-restoration', 'Малое восстановление', { level: 2, school: 'abjuration', classes: ['cleric', 'bard', 'paladin', 'ranger', 'artificer'] }),
  spell('spiritual-weapon', 'Духовное оружие', {
    level: 2,
    school: 'evocation',
    classes: ['cleric'],
    castingTime: { textRu: '1 бонусное действие', unit: 'bonus_action', amount: 1 },
    attack: 'melee',
    damage: [{ dice: '1d8', type: 'force' }],
  }),
  spell('misty-step', 'Туманный шаг', { level: 2, school: 'conjuration', classes: ['wizard', 'sorcerer', 'warlock'] }),
  spell('scorching-ray', 'Палящий луч', {
    level: 2,
    school: 'evocation',
    classes: ['wizard', 'sorcerer'],
    attack: 'ranged',
    damage: [{ dice: '2d6', type: 'fire' }],
  }),
  spell('fireball', 'Огненный шар', {
    level: 3,
    school: 'evocation',
    classes: ['wizard', 'sorcerer'],
    save: 'dex',
    range: { textRu: '150 футов', feet: 150, kind: 'ranged' },
    damage: [{ dice: '8d6', type: 'fire', scaling: 'slot' }],
  }),
  spell('counterspell', 'Контрзаклинание', { level: 3, school: 'abjuration', classes: ['wizard', 'sorcerer', 'warlock'] }),
  spell('beacon-of-hope', 'Маяк надежды', { level: 3, school: 'abjuration', classes: ['cleric'], duration: conc('Концентрация, вплоть до 1 минуты') }),
  spell('revivify', 'Возрождение', { level: 3, school: 'necromancy', classes: ['cleric', 'paladin', 'artificer'] }),
  spell('wish', 'Исполнение желаний', { level: 9, school: 'conjuration', classes: ['wizard', 'sorcerer'] }),
];

export const OTHER: ContentEntity[] = [
  human,
  dwarf,
  hillDwarf,
  elf,
  highElf,
  halfling,
  lightfoot,
  tortle,
  acolyte,
  soldier,
  criminal,
  tough,
  alert,
  observant,
  ...EQUIPMENT,
  ...SPELLS,
];
