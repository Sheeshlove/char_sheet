import { describe, expect, it } from 'vitest';
import { emptyState, type ContentEntity } from '@ps/content-schema';
import {
  applyChoice,
  compute,
  createContentIndex,
  pruneChoices,
  rollFormula,
  STARTING_GOLD_KEY,
  startingEquipmentGroups,
  startingInventory,
} from '../src';
import { mini, MINI_ENTITIES } from './fixtures/content-mini';
import { golden } from './helpers';

describe('applyChoice', () => {
  it('выборы умений, подкласс, ASI, черта, бросок хитов, заклинания', () => {
    const g = golden('05');
    let b = applyChoice(g.build, 'mini/class/barbarian#proficiencies#skills', ['athletics', 'survival']);
    expect(b.choices['mini/class/barbarian#proficiencies#skills']).toEqual(['athletics', 'survival']);
    b = applyChoice(b, 'mini/class/barbarian#proficiencies#skills', []);
    expect(b.choices['mini/class/barbarian#proficiencies#skills']).toBeUndefined();

    b = applyChoice(b, 'subclass:mini/class/barbarian', []);
    expect(b.classes[0]!.subclassKey).toBeUndefined();
    b = applyChoice(b, 'subclass:mini/class/barbarian', ['mini/subclass/berserker']);
    expect(b.classes[0]!.subclassKey).toBe('mini/subclass/berserker');

    b = applyChoice(b, 'asi:3', ['str', 'str']);
    expect(b.levels[3]!.asi).toEqual({ kind: 'asi', increases: { str: 2 } });
    b = applyChoice(b, 'asi:3', ['dex', 'con']);
    expect(b.levels[3]!.asi).toEqual({ kind: 'asi', increases: { dex: 1, con: 1 } });
    b = applyChoice(b, 'asi:3', ['mini/feat/tough']);
    expect(b.levels[3]!.asi).toEqual({ kind: 'feat', featKey: 'mini/feat/tough' });
    b = applyChoice(b, 'asi:3', []);
    expect(b.levels[3]!.asi).toBeUndefined();

    b = applyChoice(b, 'hp:1', ['9']);
    expect(b.levels[1]!.hp).toEqual({ method: 'roll', roll: 9 });

    const w = golden('03');
    let wb = applyChoice(w.build, 'spells:mini/class/wizard:cantrips', ['mini/spell/light']);
    wb = applyChoice(wb, 'spells:mini/class/wizard:spellbook', ['mini/spell/shield']);
    const ks = wb.knownSpells.find((k) => k.classKey === 'mini/class/wizard')!;
    expect(ks.cantrips).toEqual(['mini/spell/light']);
    expect(ks.spellbook).toEqual(['mini/spell/shield']);
    // Исходная сборка не изменилась.
    expect(w.build.knownSpells.find((k) => k.classKey === 'mini/class/wizard')!.cantrips.length).toBeGreaterThan(1);
  });
});

describe('pruneChoices', () => {
  it('смена расы и класса удаляет недействительные выборы, снаряжение сохраняется', () => {
    const g = golden('01');
    const b = {
      ...g.build,
      race: 'mini/race/dwarf',
      choices: { ...g.build.choices, 'equipment:mini/class/fighter#0': ['1'], 'unknown#x#y': ['z'] },
    };
    const pruned = pruneChoices(b, mini, g.rules);
    expect(pruned.choices['mini/race/human#languages#language']).toBeUndefined();
    expect(pruned.choices['unknown#x#y']).toBeUndefined();
    expect(pruned.choices['mini/class/fighter#fighting-style#fighting-style']).toEqual(['defense']);
    expect(pruned.choices['equipment:mini/class/fighter#0']).toEqual(['1']);
  });
});

describe('стартовое снаряжение', () => {
  const pack: ContentEntity = {
    key: 'mini/gear/explorers-pack',
    kind: 'gear',
    slug: 'explorers-pack',
    nameRu: 'Набор путешественника',
    effectsStatus: 'complete',
    data: { costCp: 1000, weightLb: 0, kind: 'pack', contents: [{ key: 'mini/gear/backpack', qty: 1 }, { key: 'mini/gear/iron-ingot', qty: 2 }] },
  };
  const entities = (JSON.parse(JSON.stringify(MINI_ENTITIES)) as ContentEntity[]).concat(pack);
  const fighter = entities.find((e) => e.key === 'mini/class/fighter')!;
  (fighter.data as { startingEquipment: unknown }).startingEquipment = [
    { options: [{ items: [{ key: 'mini/armor/chain-mail', qty: 1 }] }, { items: [{ key: 'mini/weapon/longsword', qty: 1 }] }] },
    { options: [{ items: [{ key: 'mini/gear/explorers-pack', qty: 1 }] }] },
  ];
  const index = createContentIndex(entities);

  it('группы вариантов и начальный инвентарь с раскрытием наборов и золотом предыстории', () => {
    const g = golden('01');
    const groups = startingEquipmentGroups(g.build, index);
    expect(groups.map((x) => x.key)).toEqual(['equipment:mini/class/fighter#0', 'equipment:mini/class/fighter#1']);
    expect(groups[0]!.options[1]!.items[0]!.nameRu).toBe('Длинный меч');
    const build = {
      ...g.build,
      choices: { ...g.build.choices, 'equipment:mini/class/fighter#0': ['1'], 'equipment:mini/class/fighter#1': ['0'] },
    };
    const s = startingInventory(build, emptyState(), index);
    expect(s.inventory.map((i) => [i.key, i.qty])).toEqual([
      ['mini/weapon/longsword', 1],
      ['mini/gear/backpack', 1],
      ['mini/gear/iron-ingot', 2],
    ]);
    expect(s.currency.gp).toBe(10);
    expect(compute(build, s, index, g.rules).carrying.weightLb).toBeGreaterThan(0);
  });

  it('предмет категории «на выбор» попадает в инвентарь только выбранным', () => {
    const amulet: ContentEntity = {
      key: 'mini/gear/amulet',
      kind: 'gear',
      slug: 'amulet',
      nameRu: 'Амулет',
      effectsStatus: 'complete',
      data: { costCp: 500, weightLb: 1, kind: 'focus', focusGroup: 'holy' },
    };
    const withAny = (JSON.parse(JSON.stringify(entities)) as ContentEntity[]).concat(amulet);
    const cls = withAny.find((e) => e.key === 'mini/class/fighter')!;
    (cls.data as { startingEquipment: unknown }).startingEquipment = [
      { options: [{ items: [{ key: 'any:simple-melee-weapons', qty: 2 }] }, { items: [{ key: 'any:holy-symbols', qty: 1 }] }] },
    ];
    const idx = createContentIndex(withAny);
    const g = golden('01');
    const [group] = startingEquipmentGroups(g.build, idx);
    const weaponPick = group!.options[0]!.items[0]!;
    expect(weaponPick.choiceKey).toBe('equipment:mini/class/fighter#0:0:0');
    expect(weaponPick.options!.map((o) => o.key)).toEqual(expect.arrayContaining(['mini/weapon/dagger', 'mini/weapon/quarterstaff']));
    expect(weaponPick.options!.map((o) => o.key)).not.toContain('mini/weapon/longsword');
    expect(group!.options[1]!.items[0]!.options).toEqual([{ key: 'mini/gear/amulet', nameRu: 'Амулет' }]);

    const choose = (extra: Record<string, string[]>) => ({ ...g.build, choices: { ...g.build.choices, 'equipment:mini/class/fighter#0': ['0'], ...extra } });
    // Не выбран — ничего; выбран чужой предмет — ничего; выбран кинжал — два кинжала.
    expect(startingInventory(choose({}), emptyState(), idx).inventory).toEqual([]);
    expect(startingInventory(choose({ 'equipment:mini/class/fighter#0:0:0': ['mini/weapon/longsword'] }), emptyState(), idx).inventory).toEqual([]);
    const s = startingInventory(choose({ 'equipment:mini/class/fighter#0:0:0': ['mini/weapon/dagger'] }), emptyState(), idx);
    expect(s.inventory.map((i) => [i.key, i.qty])).toEqual([['mini/weapon/dagger', 2]]);
  });

  it('стартовое золото вместо снаряжения', () => {
    const g = golden('01');
    const build = { ...g.build, choices: { ...g.build.choices, 'equipment:mini/class/fighter#0': ['1'], [STARTING_GOLD_KEY]: ['130'] } };
    const s = startingInventory(build, emptyState(), index);
    expect(s.inventory).toEqual([]);
    expect(s.currency.gp).toBe(140);
  });
});

describe('rollFormula', () => {
  const seq = (...vals: number[]) => {
    let i = 0;
    return () => vals[i++ % vals.length]!;
  };
  it('кости, множитель, прибавка', () => {
    expect(rollFormula('5d4*10', seq(0, 0.99, 0.5, 0.25, 0.75))).toEqual({ total: (1 + 4 + 3 + 2 + 4) * 10, dice: [1, 4, 3, 2, 4] });
    expect(rollFormula('2к6+3', seq(0.99))).toEqual({ total: 15, dice: [6, 6] });
    expect(rollFormula('d20-1', seq(0))).toEqual({ total: 0, dice: [1] });
    expect(rollFormula('4d6', seq(0.5))!.dice).toHaveLength(4);
    expect(rollFormula('', seq(0))).toBeNull();
    expect(rollFormula('1000d6', seq(0))).toBeNull();
  });
});
