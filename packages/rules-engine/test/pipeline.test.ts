import { describe, expect, it } from 'vitest';
import { emptyState, type CharacterState, type Effect, type InventoryItem } from '@ps/content-schema';
import { compute, createContentIndex, resolveValPath, summarize, ENGINE_VERSION } from '../src';
import { mini, MINI_ENTITIES } from './fixtures/content-mini';
import { golden, rules } from './helpers';

const inv = (id: string, key: string, extra: Partial<InventoryItem> = {}): InventoryItem => ({
  id,
  key,
  qty: 1,
  equipped: true,
  attuned: false,
  ...extra,
});

function sheetOf(prefix: string, state: Partial<CharacterState> = {}, mutate?: (b: ReturnType<typeof golden>['build']) => void) {
  const g = golden(prefix);
  mutate?.(g.build);
  return compute(g.build, { ...g.state, ...state }, mini, g.rules);
}

describe('снаряжение и атаки', () => {
  it('магические предметы: кольцо защиты требует настройки; +1 меч', () => {
    const base = golden('01').state.inventory;
    const noAttune = sheetOf('01', { inventory: [...base, inv('r', 'mini/item/ring-of-protection')] });
    expect(noAttune.ac.value).toBe(19);
    const attuned = sheetOf('01', { inventory: [...base, inv('r', 'mini/item/ring-of-protection', { attuned: true })] });
    expect(attuned.ac.value).toBe(20);
    expect(attuned.abilities.dex.save.value).toBe(2);
    const plus1 = sheetOf('01', {
      inventory: [inv('a', 'mini/armor/chain-mail'), inv('s', 'mini/armor/shield'), inv('w', 'mini/item/longsword-plus-1', { hand: 'main' })],
    });
    const atk = plus1.attacks.find((a) => a.itemId === 'w')!;
    expect(atk.toHit!.value).toBe(6);
    expect(atk.damage[0]).toMatchObject({ dice: '1d8', bonus: 4 });
    expect(plus1.carrying.weightLb).toBe(55 + 6 + 3);
  });

  it('пояс силы великана поднимает Силу выше предела (set_min)', () => {
    const s = sheetOf('01', { inventory: [inv('b', 'mini/item/belt-of-hill-giant-strength', { attuned: true })] });
    expect(s.abilities.str.score.value).toBe(21);
  });

  it('универсальное оружие двумя руками без щита — большая кость', () => {
    const s = sheetOf('01', { inventory: [inv('w', 'mini/weapon/longsword', { hand: 'both' })] });
    expect(s.attacks.find((a) => a.itemId === 'w')!.damage[0]!.dice).toBe('1d10');
  });

  it('два оружия: второе без положительного модификатора, с «Сражением двумя оружиями» — с ним', () => {
    const state = { inventory: [inv('a', 'mini/weapon/shortsword', { hand: 'main' }), inv('b', 'mini/weapon/handaxe', { hand: 'off' })] };
    const s = sheetOf('01', state);
    const off = s.attacks.find((a) => a.itemId === 'b')!;
    expect(off.bonusAction).toBe(true);
    expect(off.damage[0]!.bonus).toBe(0);
    const twf = sheetOf('01', state, (b) => {
      b.choices['mini/class/fighter#fighting-style#fighting-style'] = ['two-weapon-fighting'];
    });
    expect(twf.attacks.find((a) => a.itemId === 'b')!.damage[0]!.bonus).toBe(3);
  });

  it('фехтовальное оружие берёт лучшую характеристику; без владения — без БМ', () => {
    const s = sheetOf('03', { inventory: [inv('r', 'mini/weapon/rapier'), inv('d', 'mini/weapon/dagger')] });
    const rapier = s.attacks.find((a) => a.itemId === 'r')!;
    expect(rapier.ability).toBe('dex');
    expect(rapier.proficient).toBe(false);
    expect(rapier.toHit!.value).toBe(3);
    const dagger = s.attacks.find((a) => a.itemId === 'd')!;
    expect(dagger.proficient).toBe(true);
    expect(dagger.toHit!.value).toBe(5);
  });

  it('«Дуэлянт»: +2 урона, только если одно рукопашное оружие', () => {
    const g = (hand: 'main' | 'both') =>
      sheetOf('01', { inventory: [inv('w', 'mini/weapon/longsword', { hand })] }, (b) => {
        b.choices['mini/class/fighter#fighting-style#fighting-style'] = ['dueling'];
      });
    expect(g('main').attacks.find((a) => a.itemId === 'w')!.damage[0]!.bonus).toBe(5);
    expect(g('both').attacks.find((a) => a.itemId === 'w')!.damage[0]!.bonus).toBe(3);
  });

  it('заклинания со спасброском попадают в атаки; заговоры масштабируются', () => {
    const s = sheetOf('02');
    const flame = s.attacks.find((a) => a.nameRu === 'Священное пламя')!;
    expect(flame.saveDc!.value).toBe(13);
    expect(flame.saveAbility).toBe('dex');
    const w20 = sheetOf('20', {}, (b) => {
      b.knownSpells = [{ classKey: 'mini/class/wizard', cantrips: ['mini/spell/fire-bolt'], spells: [], spellbook: ['mini/spell/fireball'] }];
    });
    expect(w20.attacks.find((a) => a.nameRu === 'Огненный снаряд')!.damage[0]!.dice).toBe('4d10');
    const prepared = compute(golden('20').build, { ...emptyState(), prepared: { 'mini/class/wizard': ['mini/spell/fireball'] } }, mini, golden('20').rules);
    expect(prepared.spellcasting.classes[0]!.spells.find((x) => x.key === 'mini/spell/fireball')).toBeUndefined();
  });

  it('атака-эффект с дальностью и характеристикой str_or_dex', () => {
    const extra: Effect = {
      type: 'attack',
      id: 'spit',
      nameRu: 'Плевок',
      ability: 'str_or_dex',
      proficient: false,
      damage: [{ dice: '2', type: 'acid', addAbilityMod: false }],
      rangeFt: { normal: 30, long: 60 },
    };
    const s = sheetOf('03', {}, (b) => {
      b.manualEffects = [{ id: 'm', labelRu: 'Ручное', enabled: true, effects: [extra] }];
    });
    const line = s.attacks.find((a) => a.nameRu === 'Плевок')!;
    expect(line.ability).toBe('dex');
    expect(line.damage[0]).toMatchObject({ dice: '', bonus: 2 });
  });
});

describe('КД, скорость, нагрузка', () => {
  it('два доспеха — ошибка; средний доспех ограничивает Ловкость', () => {
    const two = sheetOf('01', { inventory: [inv('a', 'mini/armor/chain-mail'), inv('b', 'mini/armor/plate'), inv('s1', 'mini/armor/shield'), inv('s2', 'mini/armor/shield')] });
    expect(two.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['multiple_armor', 'multiple_shields']));
    const medium = sheetOf('03', { inventory: [inv('a', 'mini/armor/scale-mail')], toggles: [] });
    expect(medium.ac.value).toBe(16);
    expect(medium.issues.map((i) => i.code)).toContain('armor_not_proficient');
    expect(medium.issues.map((i) => i.code)).toContain('cannot_cast_armor');
    expect(medium.skills.stealth.modes.some((m) => m.mode === 'disadvantage')).toBe(true);
    const light = sheetOf('04', { inventory: [inv('a', 'mini/armor/studded-leather')] });
    expect(light.ac.value).toBe(12 + 3);
  });

  it('тяжёлый доспех при низкой Силе: −10 фт (кроме дварфа)', () => {
    const s = sheetOf('03', { inventory: [inv('a', 'mini/armor/plate')], toggles: [] });
    expect(s.speed.walk!.value).toBe(20);
    expect(sheetOf('02').speed.walk!.value).toBe(25);
  });

  it('состояния: схвачен — скорость 0, парализован — автопровал и недееспособен', () => {
    const g = sheetOf('01', { conditions: ['grappled'] });
    expect(g.speed.walk!.value).toBe(0);
    const p = sheetOf('01', { conditions: ['paralyzed'] });
    expect(p.abilities.str.autoFail).toBe(true);
    expect(p.status.conditions).toEqual(['paralyzed', 'incapacitated']);
    const u = sheetOf('01', { conditions: ['unconscious'], hp: { current: 0, temp: 0 } });
    expect(u.status.conditions).toEqual(expect.arrayContaining(['unconscious', 'incapacitated', 'prone']));
    expect(u.status.unconscious).toBe(true);
    const petrified = sheetOf('01', { conditions: ['petrified'] });
    expect(petrified.defenses.resistances).toHaveLength(13);
    expect(petrified.defenses.conditionImmunities).toContain('poisoned');
    const poisoned = sheetOf('04', { conditions: ['poisoned'] });
    expect(poisoned.passives.perception.value).toBe(16 - 5);
    expect(sheetOf('01', { exhaustion: 5 }).speed.walk!.value).toBe(0);
    expect(sheetOf('01', { exhaustion: 6 }).status.dead).toBe(true);
  });

  it('базовая нагрузка: только превышение грузоподъёмности; монеты весят', () => {
    const s = sheetOf('01', { inventory: [inv('x', 'mini/gear/iron-ingot', { qty: 250, equipped: false })], currency: { cp: 0, sp: 0, ep: 0, gp: 500, pp: 0 } });
    expect(s.carrying.weightLb).toBe(260);
    expect(s.carrying.status).toBe('over_capacity');
    const none = compute(golden('01').build, { ...golden('01').state, inventory: [inv('x', 'mini/gear/iron-ingot', { qty: 999 })] }, mini, rules({ encumbrance: 'none' }));
    expect(none.carrying.status).toBe('ok');
    const variant = compute(golden('01').build, { ...emptyState(), inventory: [inv('x', 'mini/gear/iron-ingot', { qty: 100, equipped: false })] }, mini, rules({ encumbrance: 'variant' }));
    expect(variant.carrying.status).toBe('encumbered');
    expect(variant.speed.walk!.value).toBe(20);
    const custom = sheetOf('01', { inventory: [{ id: 'c', customName: 'Сундук', customWeightLb: 30, qty: 2, equipped: false, attuned: false }] });
    expect(custom.carrying.weightLb).toBe(60);
  });

  it('полёт, равный скорости ходьбы; обнуление всех скоростей', () => {
    const s = sheetOf('24', { toggles: ['spell:mini/spell/mage-armor', 'shell-defense'] });
    expect(s.speed.walk!.value).toBe(0);
    expect(s.ac.value).toBe(21);
    const d = sheetOf('10', { toggles: ['dragon-wings'] }, (b) => {
      for (let i = 0; i < 11; i++) b.levels.push({ classKey: 'mini/class/sorcerer', hp: { method: 'average' } });
    });
    expect(d.speed.fly!.value).toBe(30);
  });
});

describe('переопределения, ручные эффекты, сводка', () => {
  it('переопределение сохраняет вычисленное значение', () => {
    const s = sheetOf('01', {}, (b) => {
      b.overrides = {
        ac: { value: 21, reasonRu: 'Благословение мастера' },
        'skills.stealth': { value: 9, reasonRu: 'тест' },
        'hp.max': { value: 5, reasonRu: 'проклятие' },
        'nope.path': { value: 1, reasonRu: 'x' },
      };
    });
    expect(s.ac.value).toBe(21);
    expect(s.ac.overridden).toEqual({ computed: 19, reasonRu: 'Благословение мастера' });
    expect(s.skills.stealth.value.value).toBe(9);
    expect(s.hp.max.value).toBe(5);
    expect(s.hp.current).toBe(0);
    expect(s.issues.map((i) => i.code)).toContain('override_path');
    expect(resolveValPath(s, 'pb')!.value).toBe(2);
  });

  it('ручные эффекты и бонусы одного типа не складываются', () => {
    const s = sheetOf('01', {}, (b) => {
      b.manualEffects = [
        {
          id: 'luck',
          labelRu: 'Амулет',
          enabled: true,
          effects: [
            { type: 'bonus', target: 'save:*', value: '2', bonusType: 'luck' },
            { type: 'bonus', target: 'save:*', value: '1', bonusType: 'luck' },
            { type: 'bonus', target: 'skill:stealth', value: '1' },
            { type: 'sense', sense: 'darkvision', rangeFt: 30, op: 'add' },
            { type: 'size', size: 'large' },
            { type: 'carry', sizeSteps: 1 },
            { type: 'defense', kind: 'vulnerability', damageType: 'fire' },
            { type: 'bonus', target: 'passive:insight', value: 'UNKNOWN_VAR' },
          ],
        },
        { id: 'off', labelRu: 'Выключено', enabled: false, effects: [{ type: 'bonus', target: 'ac', value: '10' }] },
      ];
    });
    expect(s.abilities.dex.save.value).toBe(1 + 2);
    expect(s.skills.stealth.value.value).toBe(2);
    expect(s.senses).toEqual([{ sense: 'darkvision', rangeFt: 30 }]);
    expect(s.size).toBe('large');
    expect(s.carrying.capacityLb).toBe(16 * 15 * 4);
    expect(s.defenses.vulnerabilities[0]!.damageType).toBe('fire');
    expect(s.ac.value).toBe(19);
    expect(s.issues.map((i) => i.code)).toContain('expr_error');
  });

  it('сводка для панели мастера', () => {
    const s = sheetOf('07');
    const sum = summarize(s);
    expect(sum).toMatchObject({ level: 5, ac: 19, hp: { max: 44 }, speedWalk: 30, engineVersion: ENGINE_VERSION });
    expect(sum.spellDcs[0]!.dc).toBe(14);
    expect(sum.saves.cha).toBe(3 + 3);
  });

  it('неизвестные ключи контента не роняют расчёт', () => {
    const g = golden('01');
    g.build.race = 'mini/race/nope';
    g.build.subrace = 'mini/subrace/nope';
    g.build.background = 'mini/background/nope';
    g.build.classes.push({ classKey: 'mini/class/nope' });
    g.build.classes[0]!.subclassKey = 'mini/subclass/nope';
    g.build.levels[0]!.asi = { kind: 'feat', featKey: 'mini/feat/nope' };
    g.build.knownSpells = [{ classKey: 'mini/class/fighter', cantrips: ['mini/spell/nope'], spells: [] }];
    g.build.choices['mini/class/fighter#fighting-style#fighting-style'] = ['nope'];
    const s = compute(g.build, g.state, mini, g.rules);
    expect(s.issues.filter((i) => i.code === 'content_missing').length).toBeGreaterThanOrEqual(5);
    expect(s.issues.map((i) => i.code)).toContain('choice_invalid');
    expect(s.speed.walk!.value).toBe(30);
  });

  it('индекс контента', () => {
    const idx = createContentIndex(MINI_ENTITIES);
    expect(idx.size).toBe(MINI_ENTITIES.length);
    expect(idx.get(undefined)).toBeUndefined();
    expect(idx.getOf('mini/class/fighter', 'race')).toBeUndefined();
    expect(idx.spellList('wizard')).toContain('mini/spell/fireball');
    expect(idx.spellList('nope')).toEqual([]);
    expect(idx.bySlug('weapon', 'longsword')?.key).toBe('mini/weapon/longsword');
    expect(idx.all().length).toBe(MINI_ENTITIES.length);
    expect(idx.has('mini/feat/tough')).toBe(true);
  });

  it('повторяемая черта из двух источников', () => {
    const g = golden('23');
    const repeatable = createContentIndex([
      ...MINI_ENTITIES.filter((e) => e.key !== 'mini/feat/tough'),
      { ...mini.get('mini/feat/tough')!, data: { repeatable: true, features: (mini.getOf('mini/feat/tough', 'feat')!.data.features) } } as never,
    ]);
    g.build.levels[5]!.asi = { kind: 'feat', featKey: 'mini/feat/tough' };
    // Неповторяемая черта второй раз не применяется, повторяемая — применяется.
    expect(compute(g.build, g.state, mini, g.rules).hp.max.value).toBe(92);
    expect(compute(g.build, g.state, repeatable, g.rules).hp.max.value).toBe(92 + 16);
  });
});

describe('выборы', () => {
  it('навыки, языки, инструменты, увеличение характеристик, черта через выбор', () => {
    const s = sheetOf('01');
    expect(s.proficiencies.languages).toEqual(expect.arrayContaining(['Общий', 'Дварфский']));
    expect(s.proficiencies.tools).toEqual(expect.arrayContaining(['Кости', 'Наземный транспорт']));
    expect(s.proficiencies.weapons).toEqual(expect.arrayContaining(['Простое оружие', 'Воинское оружие']));
    const choice = s.choices.find((c) => c.key === 'mini/class/fighter#proficiencies#skills')!;
    expect(choice.options.length).toBe(8);
    const b = golden('03');
    b.build.choices['mini/background/acolyte#proficiencies#languages'] = ['custom:Тайный язык друидов', 'dwarvish'];
    const r = compute(b.build, b.state, mini, rules({ customLanguages: ['Тайный язык друидов'] }));
    expect(r.proficiencies.languages).toContain('Тайный язык друидов');
    const feats = r.choices.find((c) => c.kind === 'choice' && c.source?.kind === 'languages')!;
    expect(feats.options.some((o) => o.value === 'custom:Тайный язык друидов')).toBe(true);
  });

  it('незаполненная черта через список и выбор-черта', () => {
    const g = golden('01');
    g.build.manualEffects = [
      {
        id: 'bonus-feat',
        labelRu: 'Бонусная черта',
        enabled: true,
        effects: [{ type: 'choice', id: 'feat', labelRu: 'Черта', choose: 1, options: { kind: 'feat' } }],
      },
    ];
    g.build.choices['manual:bonus-feat#bonus-feat#feat'] = ['mini/feat/observant'];
    g.build.choices['mini/feat/observant#observant#asi'] = ['wis'];
    const s = compute(g.build, g.state, mini, g.rules);
    expect(s.abilities.wis.score.value).toBe(15);
    expect(s.passives.perception.value).toBe(10 + 4 + 5);
  });

  it('боевой стиль как отдельная сущность (fighting_style)', () => {
    const styleEntity = {
      key: 'mini/feature/archery',
      kind: 'feature' as const,
      slug: 'archery',
      nameRu: 'Стрельба',
      effectsStatus: 'complete' as const,
      data: { features: [{ key: 'archery', nameRu: 'Стрельба', textMd: '', effectsStatus: 'complete' as const, effects: [{ type: 'bonus' as const, target: 'attack:ranged_weapon' as const, value: '2' }] }] },
    };
    const idx = createContentIndex([...MINI_ENTITIES, styleEntity]);
    const g = golden('08');
    g.build.manualEffects = [
      { id: 'fs', labelRu: 'Стиль', enabled: true, effects: [{ type: 'choice', id: 'style', labelRu: 'Стиль', choose: 1, options: { kind: 'fighting_style', styles: ['mini/feature/archery'] } }] },
    ];
    g.build.choices['manual:fs#fs#style'] = ['mini/feature/archery'];
    g.build.choices['mini/class/ranger#fighting-style#fighting-style'] = ['defense'];
    const s = compute(g.build, g.state, idx, g.rules);
    expect(s.attacks.find((a) => a.nameRu === 'Длинный лук')!.toHit!.value).toBe(7);
    expect(s.features.some((f) => f.sourceKey === 'mini/feature/archery')).toBe(true);
  });

  it('выбор заклинаний и инструментов с группой', () => {
    const s = sheetOf('06');
    const tools = s.choices.find((c) => c.key === 'mini/class/monk#proficiencies#tools-1')!;
    expect(tools.options.length).toBeGreaterThan(5);
    const w = sheetOf('13');
    expect(w.choices.find((c) => c.key === 'spells:mini/class/fighter:known')!.options.every((o) => o.hintRu !== 'заговор')).toBe(true);
    const art = sheetOf('12');
    expect(art.choices.find((c) => c.key === 'mini/class/artificer#proficiencies#tools-1')!.options.map((o) => o.value)).toEqual(
      expect.arrayContaining(['smiths-tools', 'tinkers-tools']),
    );
  });
});
