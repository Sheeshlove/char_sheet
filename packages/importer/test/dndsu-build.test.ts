import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentDataDir, readPack } from '@ps/content-data';
import { parseEntityData, type ClassData, type ContentEntity, type RaceData, type SpellData } from '@ps/content-schema';
import { slotsForCasterLevel } from '@ps/rules-engine';
import { buildDndsu } from '../src/dndsu/build';
import { CrawlCache } from '../src/dndsu/cache';
import { KeyMap } from '../src/dndsu/key-map';
import type { ParsedRecord } from '../src/dndsu/parse/record';
import { diffPacks, renderReport } from '../src/dndsu/report';
import { splitBlocks } from '../src/dndsu/parse/text';

const srd = readPack(join(contentDataDir(), 'srd')).entities;

function rec(p: Partial<ParsedRecord> & Pick<ParsedRecord, 'url' | 'section' | 'nameRu' | 'fields'>): ParsedRecord {
  const m = /\/(\d+)-/.exec(p.url)!;
  const bodyMd = p.bodyMd ?? '';
  return {
    externalId: Number(m[1]),
    homebrew: p.url.includes('/homebrew/'),
    blocks: splitBlocks(bodyMd)
      .filter((b) => b.headingRu)
      .map((b) => ({ headingRu: b.headingRu, headingEn: b.headingEn, level: b.level, md: b.md })),
    bodyMd,
    ...p,
  } as ParsedRecord;
}

const levels20 = (row: (l: number) => string) => Array.from({ length: 20 }, (_, i) => row(i + 1)).join('\n');

const barbarianMd = `## Ярость [Rage]

В бою вы сражаетесь с первобытной свирепостью.

## Защита без доспехов [Unarmored Defense]

Если вы не носите доспехов, ваш КД равен 10 + модификатор Ловкости + модификатор Телосложения.

## Безрассудная атака [Reckless Attack]

Начиная со 2-го уровня вы можете отбросить всю заботу о защите.

## Путь дикости [Primal Path]

На 3 уровне вы выбираете путь.`;

const records: ParsedRecord[] = [
  rec({
    url: 'https://dnd.su/spells/205-fireball/',
    section: 'spells',
    nameRu: 'Огненный шар',
    nameEn: 'Fireball',
    sourceBook: "Player's handbook",
    bodyMd: 'Существо получает урон огнём 8к6 при провале спасброска Ловкости.',
    fields: {
      levelSchool: '3 уровень, воплощение',
      castingTime: '1 действие',
      range: '150 футов',
      components: 'В, С, М (крошечный шарик из гуано летучей мыши и серы)',
      duration: 'Мгновенная',
      classes: 'волшебник, чародей',
      subclasses: 'Путь берсерка',
    },
  }),
  rec({
    url: 'https://dnd.su/spells/300-odd-spell/',
    section: 'spells',
    nameRu: 'Странное заклинание',
    fields: { levelSchool: 'нечто', castingTime: '1 действие', range: 'Касание', components: 'В', duration: 'Мгновенная', classes: 'бард' },
  }),
  rec({
    url: 'https://dnd.su/class/87-barbarian/',
    section: 'classes',
    nameRu: 'Варвар',
    nameEn: 'Barbarian',
    bodyMd: barbarianMd,
    fields: {
      kindHint: 'class',
      hitDie: '1к12 за каждый уровень варвара',
      savingThrows: 'Сила, Телосложение',
      armor: 'Лёгкие доспехи, средние доспехи, щиты',
      weapons: 'Простое оружие, воинское оружие',
      tools: 'Нет',
      skills: 'Выберите два навыка из следующих: Атлетика, Внимательность, Выживание, Запугивание, Природа и Уход за животными',
      table: {
        headers: ['Уровень', 'Бонус мастерства', 'Умения', 'Ярость', 'Урон ярости'],
        rows: Array.from({ length: 20 }, (_, i) => {
          const l = i + 1;
          const feats: Record<number, string> = {
            1: 'Ярость, Защита без доспехов',
            2: 'Безрассудная атака',
            3: 'Путь дикости',
            4: 'Увеличение характеристик',
            8: 'Увеличение характеристик',
            12: 'Увеличение характеристик',
            16: 'Увеличение характеристик',
            19: 'Увеличение характеристик',
          };
          return [String(l), '+2', feats[l] ?? '—', '2', '+2'];
        }),
      },
    },
  }),
  rec({
    url: 'https://dnd.su/class/150-path-of-the-berserker/',
    section: 'classes',
    nameRu: 'Путь берсерка',
    nameEn: 'Path of the Berserker',
    bodyMd: '## Бешенство [Frenzy]\n\nНачиная с 3-го уровня…',
    fields: { kindHint: 'subclass', parentUrl: 'https://dnd.su/class/87-barbarian/' },
  }),
  rec({
    url: 'https://dnd.su/homebrew/class/853-witch/',
    section: 'classes',
    nameRu: 'Ведьма',
    bodyMd: `## Использование заклинаний

Вашей базовой характеристикой для заклинаний является Мудрость. Вы подготавливаете список заклинаний.

## Проклятие [Hex Curse]

На 1 уровне вы можете проклясть.

## Шабаш

На 3 уровне вы вступаете в шабаш — это ваш подкласс.`,
    fields: {
      kindHint: 'class',
      hitDie: '1к8 за каждый уровень ведьмы',
      savingThrows: 'Мудрость, Харизма',
      armor: 'Лёгкие доспехи',
      weapons: 'Простое оружие',
      tools: 'Нет',
      skills: 'Выберите два навыка из следующих: Магия, Природа, Религия, Медицина',
      table: {
        headers: ['Уровень', 'Умения', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
        rows: levels20((l) => l.toString())
          .split('\n')
          .map((_, i) => {
            const l = i + 1;
            const f = l === 1 ? 'Использование заклинаний, Проклятие' : l === 3 ? 'Шабаш' : l === 4 ? 'Увеличение характеристик' : '—';
            return [String(l), f, ...slotsForCasterLevel(l).map((n) => (n ? String(n) : '—'))];
          }),
      },
    },
  }),
  rec({
    url: 'https://dnd.su/race/78-dwarf/',
    section: 'races',
    nameRu: 'Дварф',
    nameEn: 'Dwarf',
    bodyMd: `**Увеличение характеристик.** Значение вашего Телосложения увеличивается на 2.

**Возраст.** Дварфы взрослеют с той же скоростью, что и люди.

**Размер.** Рост дварфов от 4 до 5 футов. Ваш размер — Средний.

**Скорость.** Ваша базовая скорость ходьбы составляет 25 футов.

**Тёмное зрение.** Вы видите в тусклом освещении в пределах 60 футов.

**Языки.** Вы можете говорить, читать и писать на Общем и Дварфийском языках.

## Горный дварф [Mountain Dwarf]

**Увеличение характеристик.** Значение вашей Силы увеличивается на 2.

**Владение доспехами дварфов.** Вы владеете лёгкими и средними доспехами.`,
    fields: {
      size: 'Рост дварфов от 4 до 5 футов. Ваш размер — Средний.',
      speed: 'Ваша базовая скорость ходьбы составляет 25 футов.',
      age: 'Дварфы взрослеют с той же скоростью, что и люди.',
    },
  }),
  rec({
    url: 'https://dnd.su/backgrounds/1-acolyte/',
    section: 'backgrounds',
    nameRu: 'Прислужник',
    nameEn: 'Acolyte',
    bodyMd: `## Умение: Приют для верующих [Shelter of the Faithful]

Вы и ваши спутники можете рассчитывать на бесплатное лечение.

| к8 | Черта характера |
| --- | --- |
| 1 | Я идеализирую героя. |

| к6 | Идеал |
| --- | --- |
| 1 | Традиция. |`,
    fields: {
      skills: 'Проницательность, Религия',
      tools: 'Нет',
      languages: 'Два на ваш выбор',
      equipment: 'Священный символ, молитвенник и поясной кошель с 15 зм',
    },
  }),
  rec({
    url: 'https://dnd.su/feats/5-alert/',
    section: 'feats',
    nameRu: 'Бдительный',
    nameEn: 'Alert',
    bodyMd: 'Всегда начеку. Вы получаете бонус +5 к инициативе.',
    fields: {},
  }),
  rec({
    url: 'https://dnd.su/items/400-flame-tongue/',
    section: 'items',
    nameRu: 'Язык пламени',
    nameEn: 'Flame Tongue',
    bodyMd: 'Вы получаете бонус +1 к броскам атаки и урона этим оружием.',
    fields: { typeLine: 'Оружие (любой меч), редкое (требуется настройка)' },
  }),
];

function build(keyMap = new KeyMap()) {
  return { keyMap, result: buildDndsu({ records, keyMap, srd, overlays: {} }) };
}

describe('build dnd.su', () => {
  const { result, keyMap } = build();
  const all = [...(result.packs['dndsu-official'] ?? []), ...(result.packs['dndsu-homebrew'] ?? [])];
  const byKey = new Map(all.map((e) => [e.key, e]));

  it('все сущности проходят схемы', () => {
    for (const e of all) {
      const r = parseEntityData(e.kind, e.data);
      expect(r.success, `${e.key}: ${r.success ? '' : r.error.message}`).toBe(true);
    }
    expect([...byKey.keys()].sort()).toEqual([
      'dndsu-homebrew/class/witch',
      'dndsu-official/background/acolyte',
      'dndsu-official/class/barbarian',
      'dndsu-official/feat/alert',
      'dndsu-official/item/flame-tongue',
      'dndsu-official/race/dwarf',
      'dndsu-official/spell/fireball',
      'dndsu-official/subclass/path-of-the-berserker',
      'dndsu-official/subrace/dwarf-mountain-dwarf',
    ]);
  });

  it('заклинание: поля + эталон SRD + подклассы', () => {
    const fb = byKey.get('dndsu-official/spell/fireball') as ContentEntity<'spell'>;
    const d = fb.data as SpellData;
    expect(d).toMatchObject({ level: 3, school: 'evocation', save: 'dex', classes: ['wizard', 'sorcerer'] });
    expect(d.damage).toEqual([{ dice: '8d6', type: 'fire', scaling: 'slot' }]);
    expect(d.subclasses).toEqual(['dndsu-official/subclass/path-of-the-berserker']);
    expect(fb.sourceUrl).toBe('https://dnd.su/spells/205-fireball/');
  });

  it('нераспознанные поля перечислены, сущность не создаётся', () => {
    expect(result.problems).toContainEqual({
      key: 'dndsu-official/spell/odd-spell',
      url: 'https://dnd.su/spells/300-odd-spell/',
      field: 'levelSchool',
      value: 'нечто',
    });
    expect(result.counts.spells).toEqual({ parsed: 2, built: 1 });
  });

  it('класс с эталоном SRD: механика из SRD, умения из dnd.su', () => {
    const b = byKey.get('dndsu-official/class/barbarian')!.data as ClassData;
    const ref = srd.find((e) => e.key === 'srd/class/barbarian')!.data as ClassData;
    expect(b.hitDie).toBe(12);
    expect(b.proficiencies).toEqual(ref.proficiencies);
    expect(b.asiLevels).toEqual([4, 8, 12, 16, 19]);
    expect(b.features.map((f) => [f.key, f.level])).toEqual([
      ['rage', 1],
      ['unarmored-defense', 1],
      ['reckless-attack', 2],
      ['primal-path', 3],
    ]);
    expect(b.levels[0]!.featureKeys).toEqual(['rage', 'unarmored-defense']);
    expect(b.levels[0]!.values).toEqual(ref.levels[0]!.values);
    expect(result.warnings.filter((w) => w.key === 'dndsu-official/class/barbarian')).toEqual([]);
  });

  it('класс без эталона: извлечение из текста и таблицы', () => {
    const w = byKey.get('dndsu-homebrew/class/witch')!.data as ClassData;
    expect(w).toMatchObject({
      hitDie: 8,
      savingThrows: ['wis', 'cha'],
      subclassLevel: 3,
      subclassLabelRu: 'Шабаш',
      asiLevels: [4],
      spellcasting: { ability: 'wis', progression: 'full', preparation: 'prepared', preparedFormula: 'max(1, CLASS_LEVEL + WIS)' },
    });
    expect(w.proficiencies).toEqual({
      armor: ['light'],
      weapons: ['simple'],
      tools: [],
      skills: { choose: 2, from: ['arcana', 'nature', 'religion', 'medicine'] },
    });
    expect(w.levels[0]!.values.slots_1).toBe(2);
    expect(w.features.map((f) => f.key)).toEqual(['ispolzovanie-zaklinaniy', 'hex-curse', 'shabash']);
  });

  it('подкласс привязан к классу', () => {
    const s = byKey.get('dndsu-official/subclass/path-of-the-berserker')!;
    expect(s.data).toMatchObject({ classKey: 'dndsu-official/class/barbarian' });
  });

  it('раса и подраса: ASI, скорость, размер, тёмное зрение, языки', () => {
    const d = byKey.get('dndsu-official/race/dwarf')!.data as RaceData;
    expect(d).toMatchObject({ size: 'medium', speed: { walk: 25 }, subraceRequired: true });
    const effects = d.features.flatMap((f) => f.effects);
    expect(effects).toEqual([
      { type: 'ability', ability: 'con', op: 'add', value: '2' },
      { type: 'sense', sense: 'darkvision', rangeFt: 60, op: 'set_max' },
      { type: 'proficiency', target: 'language:common', level: 'proficient' },
      { type: 'proficiency', target: 'language:dwarvish', level: 'proficient' },
    ]);
    const sub = byKey.get('dndsu-official/subrace/dwarf-mountain-dwarf')!;
    expect(sub.data).toMatchObject({ raceKey: 'dndsu-official/race/dwarf' });
    expect((sub.data as { features: { effects: unknown[] }[] }).features[0]!.effects).toEqual([
      { type: 'ability', ability: 'str', op: 'add', value: '2' },
    ]);
  });

  it('предыстория, черта, предмет', () => {
    expect(byKey.get('dndsu-official/background/acolyte')!.data).toMatchObject({
      skills: ['insight', 'religion'],
      languages: { choose: 2 },
      gold: 15,
      feature: { key: 'shelter-of-the-faithful', nameRu: 'Приют для верующих' },
      characteristics: { traits: ['Я идеализирую героя.'], ideals: ['Традиция.'], bonds: [], flaws: [] },
    });
    expect(byKey.get('dndsu-official/feat/alert')!.effectsStatus).toBe('text_only');
    expect(byKey.get('dndsu-official/item/flame-tongue')!).toMatchObject({
      effectsStatus: 'complete',
      data: { itemType: 'weapon', rarity: 'rare', baseItem: { anyOf: 'any_sword' } },
    });
  });

  it('повторная сборка с тем же key-map даёт те же ключи', () => {
    const again = buildDndsu({ records: [...records].reverse(), keyMap: new KeyMap(JSON.parse(JSON.stringify(keyMap.data))), srd, overlays: {} });
    expect(Object.values(again.packs).flat().map((e) => e.key).sort()).toEqual([...byKey.keys()].sort());
  });

  it('оверлеи применяются к пакету', () => {
    const r = buildDndsu({
      records,
      keyMap: new KeyMap(),
      srd,
      overlays: {
        'dndsu-official': [
          {
            target: 'dndsu-official/feat/alert',
            features: { alert: { effects: [{ type: 'bonus', target: 'initiative', value: '5' }], effectsStatus: 'partial' } },
          },
        ],
      },
    });
    const alert = r.packs['dndsu-official']!.find((e) => e.key === 'dndsu-official/feat/alert')!;
    expect(alert.effectsStatus).toBe('partial');
  });

  it('отчёт: сверка количества, нераспознанное, diff', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dndsu-report-'));
    const cache = new CrawlCache(dir);
    cache.store(
      { url: 'https://dnd.su/spells/', section: 'spells', homebrew: false, type: 'list', fetchedAt: '2026-09-01T00:00:00Z', status: 200, linkCount: 3 },
      '',
    );
    const report = renderReport(result, diffPacks(result.packs), cache, new Date('2026-09-01T00:00:00Z'));
    expect(report).toContain('| spells | 3 | 0 | 2 | 1 |');
    expect(report).toContain('| levelSchool | нечто |');
    expect(report).toContain('### dndsu-official');
    rmSync(dir, { recursive: true, force: true });
  });
});
