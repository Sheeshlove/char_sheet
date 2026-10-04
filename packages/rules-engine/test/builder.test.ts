import { describe, expect, it } from 'vitest';
import { emptyBuild, emptyState } from '@ps/content-schema';
import {
  applyLevelUp,
  compute,
  CommandError,
  describeRequirement,
  levelUpOptions,
  meetsMulticlass,
  pendingChoices,
  undoLastLevel,
  validateBuild,
} from '../src';
import { mini } from './fixtures/content-mini';
import { golden, rules } from './helpers';

const codes = (issues: { code: string; severity: string }[], severity?: string) =>
  issues.filter((i) => !severity || i.severity === severity).map((i) => i.code);

describe('validateBuild', () => {
  it('эталоны без ошибок', () => {
    for (const p of ['01', '02', '03', '04', '13']) {
      const g = golden(p);
      expect(codes(validateBuild(g.build, mini, g.rules), 'error'), p).toEqual([]);
    }
  });

  it('пустая сборка: имя, раса, предыстория, класс', () => {
    const issues = validateBuild(emptyBuild(), mini, rules());
    expect(codes(issues, 'error')).toEqual(
      expect.arrayContaining(['name_required', 'race_required', 'background_required', 'class_required']),
    );
  });

  it('подраса обязательна и должна подходить расе', () => {
    const g = golden('02');
    delete g.build.subrace;
    expect(codes(validateBuild(g.build, mini, g.rules))).toContain('subrace_required');
    g.build.subrace = 'mini/subrace/high-elf';
    expect(codes(validateBuild(g.build, mini, g.rules))).toContain('subrace_mismatch');
    g.build.subrace = 'mini/subrace/nope';
    expect(codes(validateBuild(g.build, mini, g.rules))).toContain('subrace_missing');
  });

  it('несуществующие ключи и порядок уровней', () => {
    const g = golden('01');
    g.build.race = 'mini/race/nope';
    g.build.background = 'mini/background/nope';
    g.build.levels[0]!.classKey = 'mini/class/wizard';
    const c = codes(validateBuild(g.build, mini, g.rules));
    expect(c).toEqual(expect.arrayContaining(['race_missing', 'background_missing', 'first_class', 'level_class']));
    g.build.classes.push({ classKey: 'mini/class/nope' });
    g.build.classes.push({ classKey: 'mini/class/nope' });
    expect(codes(validateBuild(g.build, mini, g.rules))).toEqual(expect.arrayContaining(['class_missing', 'class_duplicate']));
  });

  it('способы характеристик', () => {
    const g = golden('01');
    g.build.abilities.base.str = 16;
    expect(codes(validateBuild(g.build, mini, g.rules))).toContain('standard_array');
    g.build.abilities.method = 'point_buy';
    expect(codes(validateBuild(g.build, mini, g.rules))).toContain('point_buy_range');
    g.build.abilities.base = { str: 15, dex: 15, con: 15, int: 15, wis: 8, cha: 8 };
    expect(codes(validateBuild(g.build, mini, g.rules))).toContain('point_buy_budget');
    g.build.abilities = { method: 'roll', base: { str: 19, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } };
    expect(codes(validateBuild(g.build, mini, g.rules))).toContain('roll_range');
    g.build.abilities = {
      method: 'roll',
      base: { str: 15, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      rolls: [[6, 6, 6, 1], [3, 3, 4, 1], [3, 3, 4, 1], [3, 3, 4, 1], [3, 3, 4, 1], [3, 3, 4, 1]],
    };
    expect(codes(validateBuild(g.build, mini, g.rules))).toContain('roll_mismatch');
    expect(codes(validateBuild(g.build, mini, rules({ abilityMethods: ['point_buy'] })))).toContain('ability_method');
  });

  it('мультикласс: запрет мастером и требования', () => {
    const g = golden('14');
    expect(codes(validateBuild(g.build, mini, rules({ multiclassAllowed: false })))).toContain('multiclass_disabled');
    g.build.abilities.base.cha = 8;
    g.build.abilities.base.int = 14;
    expect(codes(validateBuild(g.build, mini, g.rules))).toContain('multiclass_req');
    expect(meetsMulticlass({ any: [['str', 13], ['dex', 13]] }, { str: 10, dex: 13, con: 10, int: 10, wis: 10, cha: 10 })).toBe(true);
    expect(describeRequirement({ all: [['str', 13], ['cha', 13]] })).toBe('Сил 13 и Хар 13');
  });

  it('ASI: уровень, сумма, черты', () => {
    const g = golden('05');
    g.build.levels[1]!.asi = { kind: 'asi', increases: { str: 2 } };
    g.build.levels[3]!.asi = { kind: 'asi', increases: { str: 1 } };
    const c = codes(validateBuild(g.build, mini, g.rules));
    expect(c).toEqual(expect.arrayContaining(['asi_level', 'asi_sum']));
    const t = golden('23');
    expect(codes(validateBuild(t.build, mini, rules({ featsAllowed: false })))).toContain('feats_disabled');
    t.build.levels[3]!.asi = { kind: 'feat', featKey: 'mini/feat/nope' };
    expect(codes(validateBuild(t.build, mini, t.rules))).toContain('feat_missing');
  });

  it('хиты: бросок вне диапазона и не тот способ', () => {
    const g = golden('04');
    g.build.levels[1]!.hp = { method: 'roll', roll: 12 };
    expect(codes(validateBuild(g.build, mini, g.rules))).toContain('hp_roll');
    expect(codes(validateBuild(g.build, mini, rules({ hpMethod: 'average' })))).toContain('hp_method');
    expect(codes(validateBuild(golden('04').build, mini, rules({ hpMethod: 'roll' })))).toContain('hp_method');
  });

  it('заклинания: лишние, чужие, выше круга, школы', () => {
    const g = golden('13');
    g.build.knownSpells[0]!.spells.push('mini/spell/fireball', 'mini/spell/cure-wounds');
    g.build.knownSpells[0]!.cantrips.push('mini/spell/mage-hand');
    const c = codes(validateBuild(g.build, mini, g.rules));
    expect(c).toEqual(expect.arrayContaining(['too_many_known', 'too_many_cantrips', 'spell_level', 'spell_not_in_list']));
    const h = golden('13');
    h.build.knownSpells[0]!.spells = ['mini/spell/sleep', 'mini/spell/find-familiar', 'mini/spell/shield'];
    expect(codes(validateBuild(h.build, mini, h.rules))).toContain('school_restriction');
  });

  it('подкласс раньше уровня и от другого класса', () => {
    const g = golden('01');
    g.build.classes[0]!.subclassKey = 'mini/subclass/champion';
    expect(codes(validateBuild(g.build, mini, g.rules))).toContain('subclass_early');
    g.build.classes[0]!.subclassKey = 'mini/subclass/thief';
    expect(codes(validateBuild(g.build, mini, g.rules))).toContain('subclass_mismatch');
    g.build.classes[0]!.subclassKey = 'mini/subclass/nope';
    expect(codes(validateBuild(g.build, mini, g.rules))).toContain('subclass_missing');
  });

  it('незавершённые выборы — предупреждения', () => {
    const g = golden('01');
    g.build.choices = {};
    const issues = validateBuild(g.build, mini, g.rules);
    expect(codes(issues, 'warning')).toContain('pending_choice');
    expect(codes(issues, 'error')).toEqual([]);
    expect(pendingChoices(g.build, mini, g.rules).map((c) => c.key)).toEqual(
      expect.arrayContaining(['mini/class/fighter#proficiencies#skills', 'mini/class/fighter#fighting-style#fighting-style']),
    );
  });
});

describe('повышение уровня (SPEC §10)', () => {
  it('варианты: продолжить класс или взять новый с проверкой требований', () => {
    const g = golden('01');
    const opts = levelUpOptions(g.build, mini, g.rules);
    expect(opts.nextLevel).toBe(2);
    const fighter = opts.classes.find((c) => c.classKey === 'mini/class/fighter')!;
    expect(fighter.available).toBe(true);
    expect(fighter.features.map((f) => f.key)).toEqual(['action-surge']);
    expect(fighter.hpAverage).toBe(6);
    const wizard = opts.classes.find((c) => c.classKey === 'mini/class/wizard')!;
    expect(wizard.available).toBe(false);
    expect(wizard.reasonRu).toContain('Инт 13');
    const cleric = opts.classes.find((c) => c.classKey === 'mini/class/cleric')!;
    expect(cleric.available).toBe(true);
    expect(cleric.spells?.cantripsGain).toBe(3);
    expect(levelUpOptions(g.build, mini, rules({ multiclassAllowed: false })).classes).toHaveLength(1);
  });

  it('по опыту: не хватает опыта — нельзя', () => {
    const g = golden('01');
    const o = levelUpOptions(g.build, mini, g.rules, { ...emptyState(), xp: 100 });
    expect(o.canLevelUp).toBe(false);
    expect(o.reasonRu).toContain('300');
    expect(levelUpOptions(g.build, mini, g.rules, { ...emptyState(), xp: 300 }).canLevelUp).toBe(true);
  });

  it('3 уровень: подкласс; 4 уровень: ASI; заклинания мистического рыцаря', () => {
    const g = golden('01');
    let b = applyLevelUp(g.build, { classKey: 'mini/class/fighter', hp: { method: 'average' } }, mini, g.rules);
    const o3 = levelUpOptions(b, mini, g.rules).classes.find((c) => c.classKey === 'mini/class/fighter')!;
    expect(o3.needsSubclass).toBe(true);
    expect(o3.subclasses.map((s) => s.key)).toEqual(['mini/subclass/champion', 'mini/subclass/eldritch-knight']);
    b = applyLevelUp(
      b,
      {
        classKey: 'mini/class/fighter',
        hp: { method: 'roll', roll: 7 },
        subclassKey: 'mini/subclass/eldritch-knight',
        spells: { cantrips: ['mini/spell/fire-bolt', 'mini/spell/light'], spells: ['mini/spell/shield', 'mini/spell/magic-missile', 'mini/spell/sleep'] },
      },
      mini,
      g.rules,
    );
    expect(b.classes[0]!.subclassKey).toBe('mini/subclass/eldritch-knight');
    expect(b.levels[2]!.hp).toEqual({ method: 'roll', roll: 7 });
    const o4 = levelUpOptions(b, mini, g.rules).classes.find((c) => c.classKey === 'mini/class/fighter')!;
    expect(o4.asi).toBe(true);
    expect(o4.spells).toMatchObject({ knownGain: 1, canReplaceKnown: true });
    b = applyLevelUp(
      b,
      {
        classKey: 'mini/class/fighter',
        hp: { method: 'average' },
        asi: { kind: 'asi', increases: { str: 2 } },
        spells: { spells: ['mini/spell/burning-hands'], replace: { from: 'mini/spell/sleep', to: 'mini/spell/thunderwave' } },
      },
      mini,
      g.rules,
    );
    const sheet = compute(b, emptyState(), mini, g.rules);
    expect(sheet.abilities.str.score.value).toBe(18);
    expect(b.knownSpells[0]!.spells).toEqual(['mini/spell/shield', 'mini/spell/magic-missile', 'mini/spell/thunderwave', 'mini/spell/burning-hands']);
    expect(sheet.hp.max.value).toBe(12 + 8 + 9 + 8);
  });

  it('ошибки решения', () => {
    const g = golden('01');
    const d = (x: object) => () => applyLevelUp(g.build, { classKey: 'mini/class/fighter', hp: { method: 'average' }, ...x }, mini, g.rules);
    expect(d({ hp: { method: 'max' } })).toThrow(CommandError);
    expect(d({ hp: { method: 'roll', roll: 11 } })).toThrow(CommandError);
    expect(d({ asi: { kind: 'asi', increases: { str: 2 } } })).toThrow(CommandError);
    expect(d({ subclassKey: 'mini/subclass/thief' })).toThrow(CommandError);
    expect(d({ classKey: 'mini/class/wizard' })).toThrow(CommandError);
    expect(d({ classKey: 'mini/class/nope' })).toThrow(CommandError);
    expect(() =>
      applyLevelUp(g.build, { classKey: 'mini/class/fighter', hp: { method: 'roll', roll: 5 } }, mini, rules({ hpMethod: 'average' })),
    ).toThrow(CommandError);
  });

  it('новый класс и мультикласс; черта вместо ASI', () => {
    const g = golden('01');
    const b = applyLevelUp(g.build, { classKey: 'mini/class/cleric', hp: { method: 'average' }, subclassKey: 'mini/subclass/life', spells: { cantrips: ['mini/spell/light'] } }, mini, g.rules);
    expect(b.classes.map((c) => c.classKey)).toEqual(['mini/class/fighter', 'mini/class/cleric']);
    expect(b.knownSpells[0]).toMatchObject({ classKey: 'mini/class/cleric', cantrips: ['mini/spell/light'] });
    const t = golden('23');
    const lvl4 = { ...t.build, levels: t.build.levels.slice(0, 3) };
    const withFeat = applyLevelUp(lvl4, { classKey: 'mini/class/fighter', hp: { method: 'average' }, asi: { kind: 'feat', featKey: 'mini/feat/alert' } }, mini, t.rules);
    expect(compute(withFeat, emptyState(), mini, t.rules).initiative.value).toBe(2 + 5);
    expect(() =>
      applyLevelUp(lvl4, { classKey: 'mini/class/fighter', hp: { method: 'average' }, asi: { kind: 'feat', featKey: 'mini/feat/alert' } }, mini, rules({ featsAllowed: false })),
    ).toThrow(CommandError);
  });

  it('создание персонажа — первый уровень всегда максимум хитов', () => {
    const b = { ...emptyBuild('Новый'), race: 'mini/race/human', background: 'mini/background/acolyte' };
    const opts = levelUpOptions(b, mini, rules({ multiclassAllowed: false }));
    expect(opts.classes.length).toBeGreaterThan(10);
    const r = applyLevelUp(b, { classKey: 'mini/class/wizard', hp: { method: 'average' }, spells: { spellbook: ['mini/spell/shield'] } }, mini, rules());
    expect(r.levels[0]!.hp).toEqual({ method: 'max' });
    expect(r.knownSpells[0]!.spellbook).toEqual(['mini/spell/shield']);
  });

  it('отмена последнего повышения: подкласс и выборы', () => {
    const g = golden('13');
    const b = undoLastLevel(undoLastLevel(undoLastLevel(undoLastLevel(undoLastLevel(g.build, mini, g.rules), mini, g.rules), mini, g.rules), mini, g.rules), mini, g.rules);
    expect(b.levels).toHaveLength(2);
    expect(b.classes[0]!.subclassKey).toBeUndefined();
    const only = undoLastLevel(undoLastLevel(b));
    expect(only.levels).toEqual([]);
    expect(only.classes).toEqual([]);
    expect(undoLastLevel(only)).toBe(only);
    const multi = golden('15');
    const w = undoLastLevel(multi.build);
    expect(w.classes.map((c) => c.classKey)).toEqual(['mini/class/fighter']);
    const k = golden('09');
    const nine = undoLastLevel(k.build, mini, k.rules);
    expect(nine.knownSpells[0]!.spells).toHaveLength(5);
    expect(Object.keys(nine.choices)).toContain('mini/class/warlock#eldritch-invocations#invocations');
  });
});
