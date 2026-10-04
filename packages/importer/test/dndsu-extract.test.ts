import { describe, expect, it } from 'vitest';
import { singleClassCasterLevel, slotsForCasterLevel } from '@ps/rules-engine';
import {
  extractSpell,
  parseCastingTime,
  parseComponents,
  parseDuration,
  parseLevelSchool,
  parseRange,
  parseSpellMechanics,
} from '../src/dndsu/extract/spell';
import { parseAsi, parseDarkvision, parseLanguages, parseSize, parseSpeed } from '../src/dndsu/extract/race';
import {
  asiLevelsOf,
  inferProgression,
  matchName,
  parseArmor,
  parseClassTable,
  parseHitDie,
  parseSavingThrows,
  parseSkillChoice,
  parseSpellAbility,
  parseWeapons,
} from '../src/dndsu/extract/class';
import { parseBackgroundLanguages, parseBackgroundSkills, parseGold, parseItemMechanics, parseItemTypeLine } from '../src/dndsu/extract/item';
import { findTermIds, parseCount } from '../src/dndsu/terms';

describe('словарь терминов', () => {
  it('основы слов и приоритет длинного совпадения', () => {
    expect(findTermIds('damageTypes', 'урон огнём и урон холодом')).toEqual(['fire', 'cold']);
    expect(findTermIds('rarity', 'очень редкий')).toEqual(['very_rare']);
    expect(findTermIds('rarity', 'необычный')).toEqual(['uncommon']);
    expect(findTermIds('skills', 'Ловкость рук, Акробатика')).toEqual(['sleight_of_hand', 'acrobatics']);
    expect(parseCount('два')).toBe(2);
    expect(parseCount('трёх')).toBe(3);
    expect(parseCount('4')).toBe(4);
  });
});

describe('заклинания', () => {
  it('круг и школа', () => {
    expect(parseLevelSchool('3 уровень, воплощение')).toEqual({ level: 3, school: 'evocation', ritual: false });
    expect(parseLevelSchool('Заговор, вызов')).toEqual({ level: 0, school: 'conjuration', ritual: false });
    expect(parseLevelSchool('1 уровень, прорицание (ритуал)')).toEqual({ level: 1, school: 'divination', ritual: true });
    expect(parseLevelSchool('что-то')).toBeNull();
  });

  it('время накладывания', () => {
    expect(parseCastingTime('1 действие')).toMatchObject({ unit: 'action', amount: 1 });
    expect(parseCastingTime('1 бонусное действие')).toMatchObject({ unit: 'bonus_action', amount: 1 });
    expect(parseCastingTime('1 реакция, которую вы совершаете, когда…')).toMatchObject({ unit: 'reaction' });
    expect(parseCastingTime('10 минут')).toMatchObject({ unit: 'minute', amount: 10 });
    expect(parseCastingTime('8 часов')).toMatchObject({ unit: 'hour', amount: 8 });
  });

  it('дистанция', () => {
    expect(parseRange('150 футов')).toEqual({ textRu: '150 футов', kind: 'ranged', feet: 150 });
    expect(parseRange('На себя (конус 15 футов)')).toMatchObject({ kind: 'self' });
    expect(parseRange('Касание')).toMatchObject({ kind: 'touch' });
    expect(parseRange('1 миля')).toMatchObject({ kind: 'ranged', feet: 5280 });
    expect(parseRange('В пределах видимости')).toMatchObject({ kind: 'sight' });
    expect(parseRange('Неограниченная')).toMatchObject({ kind: 'unlimited' });
    expect(parseRange('Особая')).toMatchObject({ kind: 'special' });
    expect(parseRange('непонятно')).toBeNull();
  });

  it('компоненты с материалом, стоимостью и расходом', () => {
    expect(parseComponents('В, С')).toEqual({ v: true, s: true, m: false });
    expect(parseComponents('В, С, М (алмаз стоимостью не менее 500 зм, который заклинание расходует)')).toEqual({
      v: true,
      s: true,
      m: true,
      materialRu: 'алмаз стоимостью не менее 500 зм, который заклинание расходует',
      costGp: 500,
      consumed: true,
    });
    expect(parseComponents('С, М (1 000 зм)')).toMatchObject({ costGp: 1000 });
    expect(parseComponents('X, Y')).toBeNull();
  });

  it('длительность', () => {
    expect(parseDuration('Концентрация, вплоть до 1 минуты')).toEqual({
      textRu: 'Концентрация, вплоть до 1 минуты',
      concentration: true,
    });
    expect(parseDuration('Мгновенная')!.concentration).toBe(false);
  });

  it('механика: урон, спасбросок, масштабирование', () => {
    const fb = parseSpellMechanics(
      'Каждое существо в сфере должно совершить спасбросок Ловкости. Существо получает урон огнём 8к6 при провале, или половину этого урона при успехе.',
      3,
      'Урон увеличивается на 1к6 за каждый уровень ячейки выше третьего.',
    );
    expect(fb).toEqual({ save: 'dex', damage: [{ dice: '8d6', type: 'fire', scaling: 'slot' }] });

    const bolt = parseSpellMechanics(
      'Вы совершаете дальнобойную атаку заклинанием по существу. При попадании цель получает урон огнём 1к10. Урон этого заклинания увеличивается на 1к10, когда вы достигаете 5 уровня (2к10), 11 уровня (3к10) и 17 уровня (4к10).',
      0,
      undefined,
    );
    expect(bolt).toEqual({ attack: 'ranged', damage: [{ dice: '1d10', type: 'fire', scaling: 'cantrip' }] });

    const cure = parseSpellMechanics(
      'Существо, которого вы касаетесь, восстанавливает количество хитов, равное 1к8 + модификатор вашей базовой характеристики.',
      1,
      'Лечение увеличивается на 1к8 за каждый уровень ячейки выше первого.',
    );
    expect(cure.heal).toEqual({ dice: '1d8', addSpellMod: true, scaling: 'slot' });
  });

  it('неоднозначный урон не извлекается', () => {
    expect(parseSpellMechanics('Цель получает урон 2к6 и урон 1к6 огнём или холодом.', 1, undefined).damage).toBeUndefined();
  });

  it('extractSpell перечисляет нераспознанные поля', () => {
    const r = extractSpell(
      {
        levelSchool: '3 уровень, воплощение',
        castingTime: '1 действие',
        range: 'где-то рядом',
        components: 'В, С',
        duration: 'Мгновенная',
        classes: 'волшебник, чародей',
      },
      '',
    );
    expect(r.data).toBeNull();
    expect(r.problems).toEqual([{ field: 'range', value: 'где-то рядом' }]);
    const ok = extractSpell(
      {
        levelSchool: '1 уровень, прорицание (ритуал)',
        castingTime: '1 действие',
        range: 'На себя',
        components: 'В, С',
        duration: 'Концентрация, вплоть до 10 минут',
        classes: 'бард, жрец, волшебник, изобретатель',
      },
      '',
    );
    expect(ok.problems).toEqual([]);
    expect(ok.data).toMatchObject({ level: 1, ritual: true, classes: ['bard', 'cleric', 'wizard', 'artificer'] });
  });
});

describe('расы', () => {
  it('увеличение характеристик', () => {
    expect(parseAsi('Значение вашего Телосложения увеличивается на 2.')).toEqual([
      { type: 'ability', ability: 'con', op: 'add', value: '2' },
    ]);
    expect(parseAsi('Значение вашей Силы увеличивается на 2, а значение вашей Харизмы увеличивается на 1.')).toEqual([
      { type: 'ability', ability: 'str', op: 'add', value: '2' },
      { type: 'ability', ability: 'cha', op: 'add', value: '1' },
    ]);
    const halfElf = parseAsi(
      'Значение вашей Харизмы увеличивается на 2, а значения двух других ваших характеристик на ваш выбор увеличиваются на 1.',
    )!;
    expect(halfElf[0]).toEqual({ type: 'ability', ability: 'cha', op: 'add', value: '2' });
    expect(halfElf[1]).toMatchObject({
      type: 'choice',
      choose: 2,
      options: { kind: 'ability_increase', points: 2, maxPerAbility: 1, abilities: ['str', 'dex', 'con', 'int', 'wis'] },
    });
    expect(parseAsi('Значение всех ваших характеристик увеличивается на 1.')).toHaveLength(6);
    expect(parseAsi('Ничего не увеличивается.')).toBeNull();
  });

  it('скорость, размер, тёмное зрение, языки', () => {
    expect(parseSpeed('Ваша базовая скорость ходьбы составляет 25 футов.')).toEqual({ walk: 25 });
    expect(parseSpeed('Ваша базовая скорость ходьбы составляет 30 футов. Ваша скорость плавания составляет 30 футов.')).toEqual({
      walk: 30,
      swim: 30,
    });
    expect(parseSize('Рост дварфов от 4 до 5 футов. Ваш размер — Средний.')).toBe('medium');
    expect(parseSize('Ваш размер — Маленький.')).toBe('small');
    expect(parseDarkvision('Вы видите в тусклом освещении в пределах 60 футов…')).toBe(60);
    expect(parseLanguages('Вы можете говорить, читать и писать на Общем и Дварфийском языках.')).toEqual({
      known: ['common', 'dwarvish'],
      choose: 0,
    });
    expect(parseLanguages('Вы можете говорить, читать и писать на Общем и ещё одном языке на ваш выбор.')).toEqual({
      known: ['common'],
      choose: 1,
    });
  });
});

describe('классы', () => {
  it('кость хитов, спасброски, доспехи, оружие, навыки', () => {
    expect(parseHitDie('1к12 за каждый уровень варвара')).toBe(12);
    expect(parseHitDie('нет')).toBeNull();
    expect(parseSavingThrows('Сила, Телосложение')).toEqual(['str', 'con']);
    expect(parseSavingThrows('Сила')).toBeNull();
    expect(parseArmor('Лёгкие доспехи, средние доспехи, щиты')).toEqual(['light', 'medium', 'shield']);
    expect(parseArmor('Все доспехи, щиты')).toEqual(['light', 'medium', 'heavy', 'shield']);
    expect(parseArmor('Нет')).toEqual([]);
    const names = new Map([
      ['длинный меч', 'longsword'],
      ['рапира', 'rapier'],
      ['ручной арбалет', 'crossbow-hand'],
    ]);
    expect(parseWeapons('Простое оружие, воинское оружие', names)).toEqual({ weapons: ['simple', 'martial'], unknown: [] });
    expect(parseWeapons('Простое оружие, длинные мечи, рапиры, ручные арбалеты, кнуты', names)).toEqual({
      weapons: ['simple', 'longsword', 'rapier', 'crossbow-hand'],
      unknown: ['кнуты'],
    });
    expect(matchName('Длинные мечи', names)).toBe('longsword');
    expect(
      parseSkillChoice('Выберите два навыка из следующих: Атлетика, Внимательность, Выживание, Запугивание, Природа и Уход за животными'),
    ).toEqual({ choose: 2, from: ['athletics', 'perception', 'survival', 'intimidation', 'nature', 'animal_handling'] });
    expect(parseSkillChoice('Выберите любые три навыка')).toEqual({ choose: 3, from: 'any' });
    expect(parseSpellAbility('Интеллект является вашей базовой характеристикой… Вашей базовой характеристикой для заклинаний является Интеллект.')).toBe('int');
  });

  function table(headers: string[], row: (lvl: number) => string[]) {
    return { headers, rows: Array.from({ length: 20 }, (_, i) => row(i + 1)) };
  }

  it('таблица класса: колонки, ASI, значения', () => {
    const t = parseClassTable(
      table(['Уровень', 'Бонус мастерства', 'Умения', 'Ярость', 'Урон ярости'], (l) => [
        `${l}`,
        `+${Math.ceil(l / 4) + 1}`,
        [4, 8, 12, 16, 19].includes(l) ? 'Увеличение характеристик' : l === 1 ? 'Ярость, Защита без доспехов' : '—',
        l === 20 ? 'Неограниченно' : String(l < 3 ? 2 : 3),
        `+${l < 9 ? 2 : 3}`,
      ]),
    )!;
    expect(t.columns).toEqual([
      { key: 'rages', labelRu: 'Ярость' },
      { key: 'rage_damage', labelRu: 'Урон ярости' },
    ]);
    expect(t.levels[0]).toEqual({ level: 1, featureNames: ['Ярость', 'Защита без доспехов'], values: { rages: 2, rage_damage: 2 } });
    expect(t.levels[19]!.values.rages).toBe('Неограниченно');
    expect(asiLevelsOf(t)).toEqual([4, 8, 12, 16, 19]);
    expect(inferProgression(t)).toBeNull();
  });

  it('прогрессия заклинателя по ячейкам', () => {
    const full = parseClassTable(
      table(['Уровень', 'Умения', 'Известные заговоры', '1', '2', '3', '4', '5', '6', '7', '8', '9'], (l) => [
        `${l}`,
        '—',
        String(l < 4 ? 3 : l < 10 ? 4 : 5),
        ...slotsForCasterLevel(l).map((n) => (n ? String(n) : '—')),
      ]),
    )!;
    expect(full.cantripsKnown?.slice(0, 4)).toEqual([3, 3, 3, 4]);
    expect(full.slots![0]).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(inferProgression(full)).toBe('full');
    const half = parseClassTable(
      table(['Уровень', 'Умения', '1', '2', '3', '4', '5'], (l) => {
        const row = slotsForCasterLevel(singleClassCasterLevel('half', l));
        return [`${l}`, '—', ...Array.from({ length: 5 }, (_, i) => (row[i] ? String(row[i]) : '—'))];
      }),
    )!;
    expect(inferProgression(half)).toBe('half');
  });
});

describe('предметы и предыстории', () => {
  const names = new Map([['длинный меч', 'srd/weapon/longsword'], ['латы', 'srd/armor/plate-armor']]);
  it('строка типа предмета', () => {
    expect(parseItemTypeLine('Оружие (длинный меч), редкое (требуется настройка)', names)).toEqual({
      itemType: 'weapon',
      rarity: 'rare',
      attunement: {},
      baseItem: 'srd/weapon/longsword',
    });
    expect(parseItemTypeLine('Оружие (любой меч), легендарное (требуется настройка)', names)).toMatchObject({
      baseItem: { anyOf: 'any_sword' },
      rarity: 'legendary',
    });
    expect(parseItemTypeLine('Посох, очень редкий (требуется настройка волшебником)', names)).toEqual({
      itemType: 'staff',
      rarity: 'very_rare',
      attunement: { byRu: 'волшебником' },
    });
    expect(parseItemTypeLine('Чудесный предмет, необычный', names)).toEqual({ itemType: 'wondrous', rarity: 'uncommon', attunement: false });
    expect(parseItemTypeLine('Доспех (латы), легендарный', names)).toMatchObject({ itemType: 'armor', baseItem: 'srd/armor/plate-armor' });
    expect(parseItemTypeLine('Просто текст', names)).toBeNull();
  });

  it('бонусы и заряды', () => {
    expect(parseItemMechanics('Вы получаете бонус +2 к броскам атаки и урона, совершённым этим оружием.', 'weapon').effects).toHaveLength(4);
    expect(parseItemMechanics('Пока вы носите этот доспех, вы получаете бонус +1 к КД.', 'armor').effects).toEqual([
      { type: 'bonus', target: 'ac', value: '1' },
    ]);
    expect(
      parseItemMechanics('У этой палочки 7 зарядов. Палочка ежедневно восстанавливает 1к6 + 1 израсходованных зарядов на рассвете.', 'wand')
        .charges,
    ).toEqual({
      max: '7',
      rechargeRu: 'Палочка ежедневно восстанавливает 1к6 + 1 израсходованных зарядов на рассвете.',
      reset: 'dawn',
    });
  });

  it('предыстория: навыки, языки, золото', () => {
    expect(parseBackgroundSkills('Проницательность, Религия')).toEqual(['insight', 'religion']);
    expect(parseBackgroundLanguages('Два на ваш выбор')).toEqual({ choose: 2 });
    expect(parseBackgroundLanguages('Нет')).toEqual([]);
    expect(parseGold('Священный символ, молитвенник, 5 палочек благовоний, облачение, комплект обычной одежды и поясной кошель с 15 зм')).toBe(15);
  });
});
