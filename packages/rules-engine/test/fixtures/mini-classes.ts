import type { ClassData, ContentEntity, Effect, SubclassData } from '@ps/content-schema';
import { entity, feat, fightingStyleChoice, k, levelsTable, prof, skillsChoice, steps, text } from './mini-helpers';

const noEquip = { startingEquipment: [], startingGold: '5d4*10' };
const extraAttack = (level: number, attacks = 1, key = 'extra-attack') =>
  feat(key, 'Дополнительная атака', level, [{ type: 'extra_attack', attacks }]);

// ─── Воин ─────────────────────────────────────────────────────────────────

const fighterFeatures = [
  feat('fighting-style', 'Боевой стиль', 1, [
    fightingStyleChoice('fighting-style', ['archery', 'defense', 'dueling', 'great-weapon-fighting', 'protection', 'two-weapon-fighting']),
  ]),
  feat('second-wind', 'Второе дыхание', 1, [
    { type: 'resource', id: 'second-wind', nameRu: 'Второе дыхание', max: '1', reset: 'short' },
    text('Бонусным действием восстановить 1к10 + уровень воина хитов'),
  ]),
  feat('action-surge', 'Всплеск действий', 2, [
    { type: 'resource', id: 'action-surge', nameRu: 'Всплеск действий', max: 'CLASS_LEVEL >= 17 ? 2 : 1', reset: 'short' },
  ]),
  feat('martial-archetype', 'Воинский архетип', 3, []),
  extraAttack(5),
  feat('indomitable', 'Упорный', 9, [
    { type: 'resource', id: 'indomitable', nameRu: 'Упорный', max: 'CLASS_LEVEL >= 17 ? 3 : CLASS_LEVEL >= 13 ? 2 : 1', reset: 'long' },
  ]),
  extraAttack(11, 2, 'extra-attack-2'),
  extraAttack(20, 3, 'extra-attack-3'),
];

export const fighter = entity(
  'class',
  'fighter',
  'Воин',
  {
    hitDie: 10,
    savingThrows: ['str', 'con'],
    multiclassRequirement: { any: [['str', 13], ['dex', 13]] },
    proficiencies: {
      armor: ['light', 'medium', 'heavy', 'shield'],
      weapons: ['simple', 'martial'],
      tools: [],
      skills: { choose: 2, from: ['acrobatics', 'animal_handling', 'athletics', 'history', 'insight', 'intimidation', 'perception', 'survival'] },
    },
    multiclassProficiencies: { armor: ['light', 'medium', 'shield'], weapons: ['simple', 'martial'], tools: [] },
    ...noEquip,
    subclassLevel: 3,
    subclassLabelRu: 'Воинский архетип',
    asiLevels: [4, 6, 8, 12, 14, 16, 19],
    columns: [],
    levels: levelsTable(fighterFeatures, {}),
    features: fighterFeatures,
  } satisfies ClassData,
  'Fighter',
);

export const champion = entity('subclass', 'champion', 'Чемпион', {
  classKey: k('class', 'fighter'),
  features: [
    feat('improved-critical', 'Улучшенный критический удар', 3, [{ type: 'crit_range', min: 19 }]),
    feat('remarkable-athlete', 'Выдающийся атлет', 7, [
      { type: 'half_proficiency', scope: ['str', 'dex', 'con'], rounding: 'up', includeInitiative: true },
      text('Прыжок в длину с разбега дальше на модификатор Силы'),
    ]),
    feat('additional-fighting-style', 'Дополнительный боевой стиль', 10, [
      fightingStyleChoice('fighting-style-2', ['archery', 'defense', 'dueling', 'great-weapon-fighting', 'protection', 'two-weapon-fighting']),
    ]),
    feat('superior-critical', 'Превосходный критический удар', 15, [{ type: 'crit_range', min: 18 }]),
    feat('survivor', 'Уцелевший', 18, [text('В начале хода восстанавливает 5 + Тел хитов, если хитов меньше половины')]),
  ],
} satisfies SubclassData);

export const eldritchKnight = entity('subclass', 'eldritch-knight', 'Мистический рыцарь', {
  classKey: k('class', 'fighter'),
  spellcasting: {
    ability: 'int',
    progression: 'third',
    preparation: 'known',
    spellListKey: 'wizard',
    cantripsKnown: steps({ 1: 0, 3: 2, 10: 3 }) as number[],
    spellsKnown: steps({ 1: 0, 3: 3, 4: 4, 7: 5, 8: 6, 10: 7, 11: 8, 13: 9, 14: 10, 16: 11, 19: 12, 20: 13 }) as number[],
    ritualCasting: 'none',
    schoolRestriction: { schools: ['abjuration', 'evocation'], freePicksAtLevels: [3, 8, 14, 20] },
  },
  features: [
    feat('spellcasting', 'Использование заклинаний', 3, []),
    feat('weapon-bond', 'Связь с оружием', 3, []),
    feat('war-magic', 'Боевая магия', 7, []),
    feat('eldritch-strike', 'Мистический удар', 10, []),
    feat('arcane-charge', 'Магический рывок', 15, []),
    feat('improved-war-magic', 'Улучшенная боевая магия', 18, []),
  ],
} satisfies SubclassData);

// ─── Жрец ─────────────────────────────────────────────────────────────────

const clericFeatures = [
  feat('spellcasting', 'Использование заклинаний', 1, []),
  feat('channel-divinity', 'Божественный канал', 2, [
    { type: 'resource', id: 'channel-divinity', nameRu: 'Божественный канал', max: 'CLASS_LEVEL >= 18 ? 3 : CLASS_LEVEL >= 6 ? 2 : 1', reset: 'short' },
  ]),
  feat('destroy-undead', 'Уничтожение нежити', 5, []),
  feat('divine-intervention', 'Божественное вмешательство', 10, []),
];

export const cleric = entity(
  'class',
  'cleric',
  'Жрец',
  {
    hitDie: 8,
    savingThrows: ['wis', 'cha'],
    multiclassRequirement: { all: [['wis', 13]] },
    proficiencies: {
      armor: ['light', 'medium', 'shield'],
      weapons: ['simple'],
      tools: [],
      skills: { choose: 2, from: ['history', 'insight', 'medicine', 'persuasion', 'religion'] },
    },
    multiclassProficiencies: { armor: ['light', 'medium', 'shield'], weapons: [], tools: [] },
    ...noEquip,
    subclassLevel: 1,
    subclassLabelRu: 'Божественный домен',
    asiLevels: [4, 8, 12, 16, 19],
    spellcasting: {
      ability: 'wis',
      progression: 'full',
      preparation: 'prepared',
      spellListKey: 'cleric',
      cantripsKnown: steps({ 1: 3, 4: 4, 10: 5 }) as number[],
      preparedFormula: 'max(1, CLASS_LEVEL + WIS)',
      ritualCasting: 'prepared_only',
    },
    columns: [],
    levels: levelsTable(clericFeatures, {}),
    features: clericFeatures,
  } satisfies ClassData,
  'Cleric',
);

export const lifeDomain = entity('subclass', 'life', 'Домен жизни', {
  classKey: k('class', 'cleric'),
  alwaysPrepared: [
    { classLevel: 1, spells: [k('spell', 'bless'), k('spell', 'cure-wounds')] },
    { classLevel: 3, spells: [k('spell', 'lesser-restoration'), k('spell', 'spiritual-weapon')] },
    { classLevel: 5, spells: [k('spell', 'beacon-of-hope'), k('spell', 'revivify')] },
  ],
  features: [
    feat('bonus-proficiency', 'Бонусное владение', 1, [prof('armor:heavy')]),
    feat('disciple-of-life', 'Поборник жизни', 1, [text('Лечащие заклинания 1 круга и выше: +2 + круг заклинания')]),
    feat('preserve-life', 'Божественный канал: Сохранение жизни', 2, []),
    feat('blessed-healer', 'Благословенный целитель', 6, []),
    feat('divine-strike', 'Божественный удар', 8, []),
    feat('supreme-healing', 'Высшее исцеление', 17, []),
  ],
} satisfies SubclassData);

// ─── Волшебник ────────────────────────────────────────────────────────────

const wizardFeatures = [
  feat('spellcasting', 'Использование заклинаний', 1, []),
  feat('arcane-recovery', 'Магическое восстановление', 1, [
    { type: 'resource', id: 'arcane-recovery', nameRu: 'Магическое восстановление', max: '1', reset: 'long' },
    text('На коротком отдыхе восстановить ячейки суммарным кругом до половины уровня волшебника'),
  ]),
  feat('spell-mastery', 'Мастерство заклинаний', 18, []),
  feat('signature-spells', 'Коронные заклинания', 20, []),
];

export const wizard = entity(
  'class',
  'wizard',
  'Волшебник',
  {
    hitDie: 6,
    savingThrows: ['int', 'wis'],
    multiclassRequirement: { all: [['int', 13]] },
    proficiencies: {
      armor: [],
      weapons: ['dagger', 'dart', 'sling', 'quarterstaff', 'light-crossbow'],
      tools: [],
      skills: { choose: 2, from: ['arcana', 'history', 'insight', 'investigation', 'medicine', 'religion'] },
    },
    multiclassProficiencies: { armor: [], weapons: [], tools: [] },
    ...noEquip,
    subclassLevel: 2,
    subclassLabelRu: 'Магическая традиция',
    asiLevels: [4, 8, 12, 16, 19],
    spellcasting: {
      ability: 'int',
      progression: 'full',
      preparation: 'spellbook',
      spellListKey: 'wizard',
      cantripsKnown: steps({ 1: 3, 4: 4, 10: 5 }) as number[],
      preparedFormula: 'max(1, CLASS_LEVEL + INT)',
      ritualCasting: 'from_book',
    },
    columns: [],
    levels: levelsTable(wizardFeatures, {}),
    features: wizardFeatures,
  } satisfies ClassData,
  'Wizard',
);

// ─── Плут ─────────────────────────────────────────────────────────────────

const rogueFeatures = [
  feat('expertise', 'Компетентность', 1, [skillsChoice('expertise', 'Компетентность', 2, 'any', 'expertise')]),
  feat('sneak-attack', 'Скрытая атака', 1, [text('Раз в ход: дополнительный урон по колонке «Скрытая атака»')]),
  feat('thieves-cant', 'Воровской жаргон', 1, [text()]),
  feat('cunning-action', 'Хитрое действие', 2, []),
  feat('uncanny-dodge', 'Невероятное уклонение', 5, []),
  feat('expertise-2', 'Компетентность', 6, [skillsChoice('expertise-2', 'Компетентность (6 ур.)', 2, 'any', 'expertise')]),
  feat('evasion', 'Увёртливость', 7, []),
  feat('reliable-talent', 'Надёжный талант', 11, []),
  feat('blindsense', 'Слепое зрение', 14, []),
  feat('slippery-mind', 'Скользкий ум', 15, [prof('save:wis')]),
  feat('elusive', 'Неуловимость', 18, []),
  feat('stroke-of-luck', 'Удача', 20, [{ type: 'resource', id: 'stroke-of-luck', nameRu: 'Удача', max: '1', reset: 'short' }]),
];

export const rogue = entity(
  'class',
  'rogue',
  'Плут',
  {
    hitDie: 8,
    savingThrows: ['dex', 'int'],
    multiclassRequirement: { all: [['dex', 13]] },
    proficiencies: {
      armor: ['light'],
      weapons: ['simple', 'hand-crossbow', 'longsword', 'rapier', 'shortsword'],
      tools: ['thieves-tools'],
      skills: {
        choose: 4,
        from: [
          'acrobatics',
          'athletics',
          'deception',
          'insight',
          'intimidation',
          'investigation',
          'perception',
          'performance',
          'persuasion',
          'sleight_of_hand',
          'stealth',
        ],
      },
    },
    multiclassProficiencies: {
      armor: ['light'],
      weapons: [],
      tools: ['thieves-tools'],
      skills: { choose: 1, from: 'class_list' },
    },
    ...noEquip,
    subclassLevel: 3,
    subclassLabelRu: 'Плутовской архетип',
    asiLevels: [4, 8, 10, 12, 16, 19],
    columns: [{ key: 'sneak_attack', labelRu: 'Скрытая атака' }],
    levels: levelsTable(rogueFeatures, {
      sneak_attack: steps({ 1: '1к6', 3: '2к6', 5: '3к6', 7: '4к6', 9: '5к6', 11: '6к6', 13: '7к6', 15: '8к6', 17: '9к6', 19: '10к6' }),
    }),
    features: rogueFeatures,
  } satisfies ClassData,
  'Rogue',
);

export const thief = entity('subclass', 'thief', 'Вор', {
  classKey: k('class', 'rogue'),
  features: [
    feat('fast-hands', 'Быстрые руки', 3, []),
    feat('second-story-work', 'Работа на втором этаже', 3, []),
    feat('supreme-sneak', 'Непревзойдённая скрытность', 9, [
      { type: 'roll_mode', mode: 'advantage', target: 'skill:stealth', noteRu: 'Если перемещаетесь не более чем на половину скорости' },
    ]),
    feat('use-magic-device', 'Использование магических устройств', 13, []),
    feat('thiefs-reflexes', 'Воровские рефлексы', 17, []),
  ],
} satisfies SubclassData);

// ─── Варвар ───────────────────────────────────────────────────────────────

const barbarianFeatures = [
  feat('rage', 'Ярость', 1, [
    { type: 'resource', id: 'rage', nameRu: 'Ярость', max: 'CLASS_LEVEL >= 20 ? 99 : col("rages")', reset: 'long' },
    {
      type: 'toggle',
      id: 'raging',
      labelRu: 'В ярости',
      cost: { resource: 'rage', amount: 1 },
      effects: [
        { type: 'roll_mode', mode: 'advantage', target: 'check:str', noteRu: 'Проверки Силы' },
        { type: 'roll_mode', mode: 'advantage', target: 'save:str', noteRu: 'Спасброски Силы' },
        {
          type: 'bonus',
          target: 'damage:melee_weapon',
          value: 'col("rage_damage")',
          when: { all: [{ not: { armor: 'heavy' } }, { attackAbility: 'str' }] },
          labelRu: 'Урон ярости (атаки Силой)',
        },
        { type: 'defense', kind: 'resistance', damageType: 'bludgeoning' },
        { type: 'defense', kind: 'resistance', damageType: 'piercing' },
        { type: 'defense', kind: 'resistance', damageType: 'slashing' },
      ],
    },
  ]),
  feat('unarmored-defense', 'Защита без доспехов', 1, [
    { type: 'ac_formula', id: 'barbarian-ud', labelRu: 'Защита без доспехов', base: '10 + DEX + CON', allowShield: true, requires: 'no_armor' },
  ]),
  feat('reckless-attack', 'Безрассудная атака', 2, [
    {
      type: 'toggle',
      id: 'reckless',
      labelRu: 'Безрассудная атака',
      effects: [
        { type: 'roll_mode', mode: 'advantage', target: 'attack:melee_weapon', noteRu: 'Рукопашные атаки Силой в этот ход' },
        { type: 'roll_mode', mode: 'advantage', target: 'attacks_against_you', noteRu: 'Безрассудная атака' },
      ],
    },
  ]),
  feat('danger-sense', 'Чувство опасности', 2, [
    { type: 'roll_mode', mode: 'advantage', target: 'save:dex', noteRu: 'Против видимых эффектов (не ослеплён, не оглох, дееспособен)' },
  ]),
  feat('primal-path', 'Путь дикости', 3, []),
  extraAttack(5),
  feat('fast-movement', 'Быстрое передвижение', 5, [
    { type: 'speed', mode: 'walk', op: 'add', value: '10', when: { not: { armor: 'heavy' } } },
  ]),
  feat('feral-instinct', 'Дикий инстинкт', 7, [{ type: 'roll_mode', mode: 'advantage', target: 'initiative', noteRu: 'Инициатива', conditional: false }]),
  feat('brutal-critical', 'Сильный критический удар', 9, [text()]),
  feat('relentless-rage', 'Непреклонная ярость', 11, [text()]),
  feat('persistent-rage', 'Непрерывная ярость', 15, [text()]),
  feat('indomitable-might', 'Неукротимая мощь', 18, [text()]),
  feat('primal-champion', 'Первобытный чемпион', 20, [
    { type: 'ability', ability: 'str', op: 'add', value: '4' },
    { type: 'ability', ability: 'con', op: 'add', value: '4' },
    { type: 'ability_cap', ability: 'str', max: 24 },
    { type: 'ability_cap', ability: 'con', max: 24 },
  ]),
];

export const barbarian = entity(
  'class',
  'barbarian',
  'Варвар',
  {
    hitDie: 12,
    savingThrows: ['str', 'con'],
    multiclassRequirement: { all: [['str', 13]] },
    proficiencies: {
      armor: ['light', 'medium', 'shield'],
      weapons: ['simple', 'martial'],
      tools: [],
      skills: { choose: 2, from: ['animal_handling', 'athletics', 'intimidation', 'nature', 'perception', 'survival'] },
    },
    multiclassProficiencies: { armor: ['shield'], weapons: ['simple', 'martial'], tools: [] },
    ...noEquip,
    subclassLevel: 3,
    subclassLabelRu: 'Путь дикости',
    asiLevels: [4, 8, 12, 16, 19],
    columns: [
      { key: 'rages', labelRu: 'Ярость' },
      { key: 'rage_damage', labelRu: 'Урон ярости' },
    ],
    levels: levelsTable(barbarianFeatures, {
      rages: steps({ 1: 2, 3: 3, 6: 4, 12: 5, 17: 6, 20: '∞' }),
      rage_damage: steps({ 1: '+2', 9: '+3', 16: '+4' }),
    }),
    features: barbarianFeatures,
  } satisfies ClassData,
  'Barbarian',
);

export const berserker = entity('subclass', 'berserker', 'Путь берсерка', {
  classKey: k('class', 'barbarian'),
  features: [
    feat('frenzy', 'Бешенство', 3, [text('В ярости: бонусным действием одна рукопашная атака; после — истощение')]),
    feat('mindless-rage', 'Бездумная ярость', 6, [
      { type: 'condition_immunity', condition: 'charmed', when: { toggle: 'raging' } },
      { type: 'condition_immunity', condition: 'frightened', when: { toggle: 'raging' } },
    ]),
    feat('intimidating-presence', 'Пугающее присутствие', 10, []),
    feat('retaliation', 'Ответный удар', 14, []),
  ],
} satisfies SubclassData);

// ─── Монах ────────────────────────────────────────────────────────────────

const noArmorNoShield = { all: [{ armor: 'none' as const }, { shield: false }] };
const monkFeatures = [
  feat('unarmored-defense', 'Защита без доспехов', 1, [
    { type: 'ac_formula', id: 'monk-ud', labelRu: 'Защита без доспехов', base: '10 + DEX + WIS', allowShield: false, requires: 'no_armor_no_shield' },
  ]),
  feat('martial-arts', 'Боевые искусства', 1, [
    {
      type: 'weapon_option',
      filter: { monkWeapon: true, includeUnarmed: true },
      allowAbilities: ['dex'],
      minDamageDie: 'col("martial_arts")',
      labelRu: 'Боевые искусства',
      when: noArmorNoShield,
    },
    text('Безоружный удар бонусным действием после атаки'),
  ]),
  feat('ki', 'Ци', 2, [{ type: 'resource', id: 'ki', nameRu: 'Очки ци', max: 'col("ki_points")', reset: 'short' }]),
  feat('unarmored-movement', 'Движение без доспехов', 2, [
    { type: 'speed', mode: 'walk', op: 'add', value: 'col("unarmored_movement")', when: noArmorNoShield },
  ]),
  feat('monastic-tradition', 'Монастырская традиция', 3, []),
  feat('deflect-missiles', 'Отражение снарядов', 3, []),
  feat('slow-fall', 'Медленное падение', 4, []),
  extraAttack(5),
  feat('stunning-strike', 'Ошеломляющий удар', 5, []),
  feat('ki-empowered-strikes', 'Энергетические удары', 6, []),
  feat('evasion', 'Увёртливость', 7, []),
  feat('stillness-of-mind', 'Спокойствие разума', 7, []),
  feat('purity-of-body', 'Чистота тела', 10, [
    { type: 'condition_immunity', condition: 'poisoned' },
    { type: 'defense', kind: 'immunity', damageType: 'poison' },
    text('Иммунитет к болезням'),
  ]),
  feat('tongue-of-the-sun-and-moon', 'Язык солнца и луны', 13, []),
  feat('diamond-soul', 'Алмазная душа', 14, [
    prof('save:str'),
    prof('save:dex'),
    prof('save:con'),
    prof('save:int'),
    prof('save:wis'),
    prof('save:cha'),
  ]),
  feat('timeless-body', 'Безвременное тело', 15, []),
  feat('empty-body', 'Пустое тело', 18, []),
  feat('perfect-self', 'Совершенство', 20, []),
];

export const monk = entity(
  'class',
  'monk',
  'Монах',
  {
    hitDie: 8,
    savingThrows: ['str', 'dex'],
    multiclassRequirement: { all: [['dex', 13], ['wis', 13]] },
    proficiencies: {
      armor: [],
      weapons: ['simple', 'shortsword'],
      tools: ['choice:1:any'],
      skills: { choose: 2, from: ['acrobatics', 'athletics', 'history', 'insight', 'religion', 'stealth'] },
    },
    multiclassProficiencies: { armor: [], weapons: ['simple', 'shortsword'], tools: [] },
    ...noEquip,
    subclassLevel: 3,
    subclassLabelRu: 'Монастырская традиция',
    asiLevels: [4, 8, 12, 16, 19],
    columns: [
      { key: 'martial_arts', labelRu: 'Боевые искусства' },
      { key: 'ki_points', labelRu: 'Очки ци' },
      { key: 'unarmored_movement', labelRu: 'Движение без доспехов' },
    ],
    levels: levelsTable(monkFeatures, {
      martial_arts: steps({ 1: '1к4', 5: '1к6', 11: '1к8', 17: '1к10' }),
      ki_points: Array.from({ length: 20 }, (_, i) => (i === 0 ? '—' : i + 1)),
      unarmored_movement: steps({ 1: '—', 2: '+10', 6: '+15', 10: '+20', 14: '+25', 18: '+30' }),
    }),
    features: monkFeatures,
  } satisfies ClassData,
  'Monk',
);

export const openHand = entity('subclass', 'open-hand', 'Путь открытой ладони', {
  classKey: k('class', 'monk'),
  features: [
    feat('open-hand-technique', 'Техника открытой ладони', 3, []),
    feat('wholeness-of-body', 'Исцеление тела', 6, [
      { type: 'resource', id: 'wholeness-of-body', nameRu: 'Исцеление тела', max: '1', reset: 'long' },
      text('Действием восстановить хиты: утроенный уровень монаха'),
    ]),
    feat('tranquility', 'Умиротворение', 11, []),
    feat('quivering-palm', 'Дрожащая ладонь', 17, []),
  ],
} satisfies SubclassData);

// ─── Паладин ──────────────────────────────────────────────────────────────

const paladinFeatures = [
  feat('divine-sense', 'Божественное чувство', 1, [
    { type: 'resource', id: 'divine-sense', nameRu: 'Божественное чувство', max: 'max(1, 1 + CHA)', reset: 'long' },
  ]),
  feat('lay-on-hands', 'Наложение рук', 1, [
    { type: 'resource', id: 'lay-on-hands', nameRu: 'Наложение рук (хиты)', max: 'CLASS_LEVEL * 5', reset: 'long' },
  ]),
  feat('fighting-style', 'Боевой стиль', 2, [fightingStyleChoice('fighting-style', ['defense', 'dueling', 'great-weapon-fighting', 'protection'])]),
  feat('spellcasting', 'Использование заклинаний', 2, []),
  feat('divine-smite', 'Божественная кара', 2, [text('Потратить ячейку: +2к8 излучением (+1к8 за круг выше 1)')]),
  feat('divine-health', 'Божественное здоровье', 3, [text('Иммунитет к болезням')]),
  extraAttack(5),
  feat('aura-of-protection', 'Аура защиты', 6, [
    { type: 'bonus', target: 'save:*', value: 'max(1, CHA)', labelRu: 'Аура защиты' },
  ]),
  feat('aura-of-courage', 'Аура отваги', 10, [{ type: 'condition_immunity', condition: 'frightened' }]),
  feat('improved-divine-smite', 'Улучшенная божественная кара', 11, []),
  feat('cleansing-touch', 'Очищающее касание', 14, [
    { type: 'resource', id: 'cleansing-touch', nameRu: 'Очищающее касание', max: 'max(1, CHA)', reset: 'long' },
  ]),
];

export const paladin = entity(
  'class',
  'paladin',
  'Паладин',
  {
    hitDie: 10,
    savingThrows: ['wis', 'cha'],
    multiclassRequirement: { all: [['str', 13], ['cha', 13]] },
    proficiencies: {
      armor: ['light', 'medium', 'heavy', 'shield'],
      weapons: ['simple', 'martial'],
      tools: [],
      skills: { choose: 2, from: ['athletics', 'insight', 'intimidation', 'medicine', 'persuasion', 'religion'] },
    },
    multiclassProficiencies: { armor: ['light', 'medium', 'shield'], weapons: ['simple', 'martial'], tools: [] },
    ...noEquip,
    subclassLevel: 3,
    subclassLabelRu: 'Священная клятва',
    asiLevels: [4, 8, 12, 16, 19],
    spellcasting: {
      ability: 'cha',
      progression: 'half',
      preparation: 'prepared',
      spellListKey: 'paladin',
      preparedFormula: 'max(1, floor(CLASS_LEVEL / 2) + CHA)',
      ritualCasting: 'none',
    },
    columns: [],
    levels: levelsTable(paladinFeatures, {}),
    features: paladinFeatures,
  } satisfies ClassData,
  'Paladin',
);

// ─── Следопыт ─────────────────────────────────────────────────────────────

const rangerFeatures = [
  feat('favored-enemy', 'Избранный враг', 1, []),
  feat('natural-explorer', 'Исследователь природы', 1, []),
  feat('fighting-style', 'Боевой стиль', 2, [fightingStyleChoice('fighting-style', ['archery', 'defense', 'dueling', 'two-weapon-fighting'])]),
  feat('spellcasting', 'Использование заклинаний', 2, []),
  feat('primeval-awareness', 'Первозданная осведомлённость', 3, []),
  extraAttack(5),
  feat('lands-stride', 'Тропами земли', 8, []),
  feat('hide-in-plain-sight', 'Маскировка на виду', 10, []),
  feat('vanish', 'Исчезновение', 14, []),
  feat('feral-senses', 'Дикие чувства', 18, []),
  feat('foe-slayer', 'Убийца врагов', 20, []),
];

export const ranger = entity(
  'class',
  'ranger',
  'Следопыт',
  {
    hitDie: 10,
    savingThrows: ['str', 'dex'],
    multiclassRequirement: { all: [['dex', 13], ['wis', 13]] },
    proficiencies: {
      armor: ['light', 'medium', 'shield'],
      weapons: ['simple', 'martial'],
      tools: [],
      skills: {
        choose: 3,
        from: ['animal_handling', 'athletics', 'insight', 'investigation', 'nature', 'perception', 'stealth', 'survival'],
      },
    },
    multiclassProficiencies: {
      armor: ['light', 'medium', 'shield'],
      weapons: ['simple', 'martial'],
      tools: [],
      skills: { choose: 1, from: 'class_list' },
    },
    ...noEquip,
    subclassLevel: 3,
    subclassLabelRu: 'Архетип следопыта',
    asiLevels: [4, 8, 12, 16, 19],
    spellcasting: {
      ability: 'wis',
      progression: 'half',
      preparation: 'known',
      spellListKey: 'ranger',
      spellsKnown: steps({ 1: 0, 2: 2, 3: 3, 5: 4, 7: 5, 9: 6, 11: 7, 13: 8, 15: 9, 17: 10, 19: 11 }) as number[],
      ritualCasting: 'none',
    },
    columns: [],
    levels: levelsTable(rangerFeatures, {}),
    features: rangerFeatures,
  } satisfies ClassData,
  'Ranger',
);

// ─── Колдун ───────────────────────────────────────────────────────────────

const warlockFeatures = [
  feat('otherworldly-patron', 'Потусторонний покровитель', 1, []),
  feat('pact-magic', 'Магия договора', 1, []),
  feat('eldritch-invocations', 'Таинственные воззвания', 2, [
    {
      type: 'choice',
      id: 'invocations',
      labelRu: 'Воззвания',
      choose: 'col("invocations_known")',
      replaceOnLevelUp: true,
      options: {
        kind: 'list',
        items: [
          { value: 'agonizing-blast', labelRu: 'Мучительный взрыв', effects: [text('+Хар к урону мистического заряда')] },
          {
            value: 'armor-of-shadows',
            labelRu: 'Доспех теней',
            effects: [{ type: 'spell_grant', spell: k('spell', 'mage-armor'), ability: 'cha', mode: 'innate' }],
          },
          {
            value: 'devils-sight',
            labelRu: 'Дьявольское зрение',
            effects: [{ type: 'sense', sense: 'darkvision', rangeFt: 120, op: 'set_max' }],
          },
        ],
      },
    },
  ]),
  feat('pact-boon', 'Предмет договора', 3, []),
  feat('eldritch-master', 'Таинственный мастер', 20, []),
];

const cantrip20 = (points: Record<number, number>) => steps(points) as number[];

export const warlock = entity(
  'class',
  'warlock',
  'Колдун',
  {
    hitDie: 8,
    savingThrows: ['wis', 'cha'],
    multiclassRequirement: { all: [['cha', 13]] },
    proficiencies: {
      armor: ['light'],
      weapons: ['simple'],
      tools: [],
      skills: { choose: 2, from: ['arcana', 'deception', 'history', 'intimidation', 'investigation', 'nature', 'religion'] },
    },
    multiclassProficiencies: { armor: ['light'], weapons: ['simple'], tools: [] },
    ...noEquip,
    subclassLevel: 1,
    subclassLabelRu: 'Потусторонний покровитель',
    asiLevels: [4, 8, 12, 16, 19],
    spellcasting: {
      ability: 'cha',
      progression: 'pact',
      preparation: 'known',
      spellListKey: 'warlock',
      cantripsKnown: cantrip20({ 1: 2, 4: 3, 10: 4 }),
      spellsKnown: cantrip20({ 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8, 8: 9, 9: 10, 11: 11, 13: 12, 15: 13, 17: 14, 19: 15 }),
      ritualCasting: 'none',
    },
    columns: [{ key: 'invocations_known', labelRu: 'Известные воззвания' }],
    levels: levelsTable(warlockFeatures, {
      invocations_known: steps({ 1: 0, 2: 2, 5: 3, 7: 4, 9: 5, 12: 6, 15: 7, 18: 8 }),
    }),
    features: warlockFeatures,
  } satisfies ClassData,
  'Warlock',
);

export const fiend = entity('subclass', 'fiend', 'Исчадие', {
  classKey: k('class', 'warlock'),
  expandedSpellList: [
    { spellLevel: 1, spells: [k('spell', 'burning-hands'), k('spell', 'command')] },
    { spellLevel: 3, spells: [k('spell', 'fireball')] },
  ],
  features: [
    feat('dark-ones-blessing', 'Благословение тёмного', 1, [text('Убив врага, получить временные хиты: Хар + уровень колдуна')]),
    feat('dark-ones-own-luck', 'Удача тёмного', 6, [{ type: 'resource', id: 'dark-ones-luck', nameRu: 'Удача тёмного', max: '1', reset: 'short' }]),
    feat('fiendish-resilience', 'Адская стойкость', 10, []),
    feat('hurl-through-hell', 'Бросок сквозь ад', 14, []),
  ],
} satisfies SubclassData);

// ─── Чародей ──────────────────────────────────────────────────────────────

const sorcererFeatures = [
  feat('spellcasting', 'Использование заклинаний', 1, []),
  feat('sorcerous-origin', 'Происхождение чародея', 1, []),
  feat('font-of-magic', 'Источник магии', 2, [
    { type: 'resource', id: 'sorcery-points', nameRu: 'Единицы чародейства', max: 'col("sorcery_points")', reset: 'long' },
  ]),
  feat('metamagic', 'Метамагия', 3, []),
  feat('sorcerous-restoration', 'Чародейское восстановление', 20, []),
];

export const sorcerer = entity(
  'class',
  'sorcerer',
  'Чародей',
  {
    hitDie: 6,
    savingThrows: ['con', 'cha'],
    multiclassRequirement: { all: [['cha', 13]] },
    proficiencies: {
      armor: [],
      weapons: ['dagger', 'dart', 'sling', 'quarterstaff', 'light-crossbow'],
      tools: [],
      skills: { choose: 2, from: ['arcana', 'deception', 'insight', 'intimidation', 'persuasion', 'religion'] },
    },
    multiclassProficiencies: { armor: [], weapons: [], tools: [] },
    ...noEquip,
    subclassLevel: 1,
    subclassLabelRu: 'Происхождение чародея',
    asiLevels: [4, 8, 12, 16, 19],
    spellcasting: {
      ability: 'cha',
      progression: 'full',
      preparation: 'known',
      spellListKey: 'sorcerer',
      cantripsKnown: cantrip20({ 1: 4, 4: 5, 10: 6 }),
      spellsKnown: cantrip20({ 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8, 8: 9, 9: 10, 10: 11, 11: 12, 13: 13, 15: 14, 17: 15 }),
      ritualCasting: 'none',
    },
    columns: [{ key: 'sorcery_points', labelRu: 'Единицы чародейства' }],
    levels: levelsTable(sorcererFeatures, {
      sorcery_points: Array.from({ length: 20 }, (_, i) => (i === 0 ? '—' : i + 1)),
    }),
    features: sorcererFeatures,
  } satisfies ClassData,
  'Sorcerer',
);

export const draconic = entity('subclass', 'draconic-bloodline', 'Наследие драконьей крови', {
  classKey: k('class', 'sorcerer'),
  features: [
    feat('dragon-ancestor', 'Драконий предок', 1, [
      {
        type: 'choice',
        id: 'ancestor',
        labelRu: 'Драконий предок',
        choose: 1,
        options: {
          kind: 'list',
          items: [
            { value: 'red', labelRu: 'Красный (огонь)', effects: [] },
            { value: 'blue', labelRu: 'Синий (электричество)', effects: [] },
            { value: 'white', labelRu: 'Белый (холод)', effects: [] },
          ],
        },
      },
      prof('language:draconic'),
    ]),
    feat('draconic-resilience', 'Драконья устойчивость', 1, [
      { type: 'hp_max', value: 'CLASS_LEVEL' },
      { type: 'ac_formula', id: 'draconic-resilience', labelRu: 'Драконья устойчивость', base: '13 + DEX', allowShield: true, requires: 'no_armor' },
    ]),
    feat('elemental-affinity', 'Родство со стихией', 6, []),
    feat('dragon-wings', 'Драконьи крылья', 14, [
      { type: 'toggle', id: 'dragon-wings', labelRu: 'Драконьи крылья', effects: [{ type: 'speed', mode: 'fly', op: 'equal_walk' }] },
    ]),
    feat('draconic-presence', 'Драконье присутствие', 18, []),
  ],
} satisfies SubclassData);

// ─── Бард ─────────────────────────────────────────────────────────────────

const bardFeatures = [
  feat('spellcasting', 'Использование заклинаний', 1, []),
  feat('bardic-inspiration', 'Вдохновение барда', 1, [
    {
      type: 'resource',
      id: 'bardic-inspiration',
      nameRu: 'Вдохновение барда',
      max: 'max(1, CHA)',
      reset: 'long',
      die: 'col("bardic_inspiration")',
      when: 'CLASS_LEVEL < 5',
    },
  ]),
  feat('jack-of-all-trades', 'Мастер на все руки', 2, [
    { type: 'half_proficiency', scope: 'checks', rounding: 'down', includeInitiative: true },
  ]),
  feat('song-of-rest', 'Песнь отдыха', 2, []),
  feat('bard-college', 'Коллегия бардов', 3, []),
  feat('expertise', 'Компетентность', 3, [skillsChoice('expertise', 'Компетентность', 2, 'any', 'expertise')]),
  feat('font-of-inspiration', 'Источник вдохновения', 5, [
    {
      type: 'resource',
      id: 'bardic-inspiration',
      nameRu: 'Вдохновение барда',
      max: 'max(1, CHA)',
      reset: 'short',
      die: 'col("bardic_inspiration")',
    },
  ]),
  feat('countercharm', 'Контрочарование', 6, []),
  feat('expertise-2', 'Компетентность', 10, [skillsChoice('expertise-2', 'Компетентность (10 ур.)', 2, 'any', 'expertise')]),
  feat('magical-secrets', 'Тайны магии', 10, []),
  feat('superior-inspiration', 'Превосходное вдохновение', 20, []),
];

export const bard = entity(
  'class',
  'bard',
  'Бард',
  {
    hitDie: 8,
    savingThrows: ['dex', 'cha'],
    multiclassRequirement: { all: [['cha', 13]] },
    proficiencies: {
      armor: ['light'],
      weapons: ['simple', 'hand-crossbow', 'longsword', 'rapier', 'shortsword'],
      tools: ['choice:3:musical'],
      skills: { choose: 3, from: 'any' },
    },
    multiclassProficiencies: { armor: ['light'], weapons: [], tools: ['choice:1:musical'], skills: { choose: 1, from: 'any' } },
    ...noEquip,
    subclassLevel: 3,
    subclassLabelRu: 'Коллегия бардов',
    asiLevels: [4, 8, 12, 16, 19],
    spellcasting: {
      ability: 'cha',
      progression: 'full',
      preparation: 'known',
      spellListKey: 'bard',
      cantripsKnown: cantrip20({ 1: 2, 4: 3, 10: 4 }),
      spellsKnown: cantrip20({ 1: 4, 2: 5, 3: 6, 4: 7, 5: 8, 6: 9, 7: 10, 8: 11, 9: 12, 10: 14, 11: 15, 13: 16, 14: 18, 15: 19, 17: 20, 18: 22 }),
      ritualCasting: 'prepared_only',
    },
    columns: [{ key: 'bardic_inspiration', labelRu: 'Кость вдохновения' }],
    levels: levelsTable(bardFeatures, { bardic_inspiration: steps({ 1: '1к6', 5: '1к8', 10: '1к10', 15: '1к12' }) }),
    features: bardFeatures,
  } satisfies ClassData,
  'Bard',
);

// ─── Изобретатель ─────────────────────────────────────────────────────────

const artificerFeatures = [
  feat('magical-tinkering', 'Магическая мастеровитость', 1, []),
  feat('spellcasting', 'Использование заклинаний', 1, []),
  feat('infuse-item', 'Наделение предмета', 2, []),
  feat('the-right-tool', 'Нужный инструмент', 3, []),
  feat('tool-expertise', 'Экспертиза в инструментах', 6, []),
  feat('flash-of-genius', 'Вспышка гения', 7, [
    { type: 'resource', id: 'flash-of-genius', nameRu: 'Вспышка гения', max: 'max(1, INT)', reset: 'long' },
  ]),
  feat('magic-item-adept', 'Знаток магических предметов', 10, []),
  feat('spell-storing-item', 'Предмет, хранящий заклинание', 11, []),
  feat('magic-item-savant', 'Эксперт магических предметов', 14, []),
  feat('magic-item-master', 'Мастер магических предметов', 18, []),
  feat('soul-of-artifice', 'Душа изобретения', 20, [text('+1 к спасброскам за каждый настроенный предмет')]),
];

export const artificer = entity(
  'class',
  'artificer',
  'Изобретатель',
  {
    hitDie: 8,
    savingThrows: ['con', 'int'],
    multiclassRequirement: { all: [['int', 13]] },
    proficiencies: {
      armor: ['light', 'medium', 'shield'],
      weapons: ['simple'],
      tools: ['thieves-tools', 'tinkers-tools', 'choice:1:artisan'],
      skills: { choose: 2, from: ['arcana', 'history', 'investigation', 'medicine', 'nature', 'perception', 'sleight_of_hand'] },
    },
    multiclassProficiencies: { armor: ['light', 'medium', 'shield'], weapons: [], tools: ['thieves-tools', 'tinkers-tools'] },
    ...noEquip,
    subclassLevel: 3,
    subclassLabelRu: 'Специализация',
    asiLevels: [4, 8, 12, 16, 19],
    spellcasting: {
      ability: 'int',
      progression: 'half_up',
      preparation: 'prepared',
      spellListKey: 'artificer',
      cantripsKnown: cantrip20({ 1: 2, 10: 3, 14: 4 }),
      preparedFormula: 'max(1, floor(CLASS_LEVEL / 2) + INT)',
      ritualCasting: 'prepared_only',
    },
    columns: [],
    levels: levelsTable(artificerFeatures, {}),
    features: artificerFeatures,
  } satisfies ClassData,
  'Artificer',
);

export const CLASSES: ContentEntity[] = [
  fighter,
  champion,
  eldritchKnight,
  cleric,
  lifeDomain,
  wizard,
  rogue,
  thief,
  barbarian,
  berserker,
  monk,
  openHand,
  paladin,
  ranger,
  warlock,
  fiend,
  sorcerer,
  draconic,
  bard,
  artificer,
];

export type { Effect };
