import { describe, expect, it } from 'vitest';
import type { CharacterState, StateCommand } from '@ps/content-schema';
import { applyCommand, compute, CommandError, initialState, stateAfterBuildChange } from '../src';
import { mini } from './fixtures/content-mini';
import { golden } from './helpers';

function setup(prefix: string, patch: Partial<CharacterState> = {}) {
  const g = golden(prefix);
  const state = { ...initialState(g.build, g.state, mini, g.rules), ...patch };
  const run = (s: CharacterState, cmd: StateCommand) => applyCommand(g.build, s, cmd, mini, g.rules);
  return { g, state, run };
}

describe('команды: урон и лечение (SPEC §8.10)', () => {
  it('сначала списываются временные хиты, затем обычные', () => {
    const { state, run } = setup('01');
    expect(state.hp.current).toBe(12);
    const s1 = run({ ...state, hp: { current: 12, temp: 5 } }, { type: 'damage', amount: 7 }).state;
    expect(s1.hp).toEqual({ current: 10, temp: 0 });
  });

  it('сопротивление — половина вниз, иммунитет — 0, уязвимость — ×2', () => {
    const { state, run } = setup('02'); // сопротивление яду у дварфа
    expect(run(state, { type: 'damage', amount: 7, damageType: 'poison' }).state.hp.current).toBe(12 - 3);
    const monk = setup('06');
    expect(monk.run(monk.state, { type: 'damage', amount: 7, damageType: 'fire' }).state.hp.current).toBe(45 - 7);
  });

  it('немагический дробящий/колющий/рубящий: сопротивление ярости работает и для магического', () => {
    const { state, run } = setup('05', { toggles: ['raging'] });
    expect(run(state, { type: 'damage', amount: 10, damageType: 'slashing', magical: true }).state.hp.current).toBe(50 - 5);
  });

  it('падение до 0: без сознания и событие; огромный урон — смерть', () => {
    const { state, run } = setup('01');
    const r = run(state, { type: 'damage', amount: 15 });
    expect(r.state.hp.current).toBe(0);
    expect(r.state.conditions).toContain('unconscious');
    expect(r.events).toContainEqual({ type: 'dropped_to_zero' });
    const dead = run(state, { type: 'damage', amount: 24 });
    expect(dead.state.deathSaves.dead).toBe(true);
    expect(dead.events).toContainEqual({ type: 'died', reason: 'massive_damage' });
  });

  it('урон при 0 хитах: +1 провал, +2 при крите, 3 провала — смерть', () => {
    const { state, run } = setup('01', { hp: { current: 0, temp: 0 } });
    const a = run(state, { type: 'damage', amount: 3 }).state;
    expect(a.deathSaves.failures).toBe(1);
    const b = run(a, { type: 'damage', amount: 3, critical: true });
    expect(b.state.deathSaves.dead).toBe(true);
    expect(b.events).toContainEqual({ type: 'died', reason: 'death_saves' });
    expect(run(state, { type: 'damage', amount: 12 }).state.deathSaves.dead).toBe(true);
  });

  it('концентрация: событие проверки со Сл max(10, урон/2)', () => {
    const { state, run } = setup('02', { concentration: { spellKey: 'mini/spell/bless', sinceIso: '2026-01-01' } });
    const r = run(state, { type: 'damage', amount: 30 });
    expect(r.events).toContainEqual({ type: 'concentration_check', dc: 15, spellKey: 'mini/spell/bless' });
    expect(run(state, { type: 'damage', amount: 4 }).events[0]).toEqual({ type: 'concentration_check', dc: 10, spellKey: 'mini/spell/bless' });
  });

  it('лечение при 0: хиты = лечение, сброс спасбросков; не выше максимума', () => {
    const { state, run } = setup('01', {
      hp: { current: 0, temp: 0 },
      conditions: ['unconscious'],
      deathSaves: { successes: 1, failures: 2, stable: false, dead: false },
    });
    const r = run(state, { type: 'heal', amount: 5 });
    expect(r.state.hp.current).toBe(5);
    expect(r.state.deathSaves).toEqual({ successes: 0, failures: 0, stable: false, dead: false });
    expect(r.state.conditions).not.toContain('unconscious');
    expect(run(r.state, { type: 'heal', amount: 50 }).state.hp.current).toBe(12);
  });

  it('временные хиты не складываются; ручная правка хитов', () => {
    const { state, run } = setup('01');
    const a = run(state, { type: 'set_temp_hp', amount: 5 }).state;
    expect(run(a, { type: 'set_temp_hp', amount: 3 }).state.hp.temp).toBe(5);
    expect(run(a, { type: 'set_temp_hp', amount: 8 }).state.hp.temp).toBe(8);
    expect(run(state, { type: 'set_hp', current: 99 }).state.hp.current).toBe(12);
    expect(run({ ...state, hp: { current: 0, temp: 0 }, conditions: ['unconscious'] }, { type: 'set_hp', current: 4 }).state.conditions).toEqual([]);
  });
});

describe('команды: спасброски от смерти', () => {
  const dying = { hp: { current: 0, temp: 0 }, conditions: ['unconscious' as const] };
  it('3 успеха — стабилен; 3 провала — смерть; nat1 — два провала; nat20 — 1 хит', () => {
    const { state, run } = setup('01', dying);
    let s = state;
    for (let i = 0; i < 3; i++) s = run(s, { type: 'death_save', result: 'success' }).state;
    expect(s.deathSaves.stable).toBe(true);
    const f = run(run(state, { type: 'death_save', result: 'nat1' }).state, { type: 'death_save', result: 'failure' });
    expect(f.state.deathSaves.dead).toBe(true);
    const n20 = run(state, { type: 'death_save', result: 'nat20' });
    expect(n20.state.hp.current).toBe(1);
    expect(n20.state.conditions).not.toContain('unconscious');
  });
  it('нельзя бросать спасброски от смерти с хитами', () => {
    const { state, run } = setup('01');
    expect(() => run(state, { type: 'death_save', result: 'success' })).toThrow(CommandError);
  });
});

describe('команды: ячейки, ресурсы, переключатели', () => {
  it('трата и восстановление ячеек; ошибка при нехватке', () => {
    const { state, run } = setup('07');
    let s = state;
    for (let i = 0; i < 4; i++) s = run(s, { type: 'spend_slot', level: 1 }).state;
    expect(s.slotsUsed[1]).toBe(4);
    expect(() => run(s, { type: 'spend_slot', level: 1 })).toThrow(CommandError);
    expect(() => run(s, { type: 'spend_slot', level: 3 })).toThrow(CommandError);
    expect(run(s, { type: 'restore_slot', level: 1 }).state.slotsUsed[1]).toBe(3);
  });
  it('ячейки договора и короткий отдых (эталон 09)', () => {
    const { state, run } = setup('09', { pactSlotsUsed: 0 });
    const a = run(run(state, { type: 'spend_slot', level: 3, pact: true }).state, { type: 'spend_slot', level: 3, pact: true }).state;
    expect(a.pactSlotsUsed).toBe(2);
    expect(() => run(a, { type: 'spend_slot', level: 3, pact: true })).toThrow(CommandError);
    expect(() => run(a, { type: 'spend_slot', level: 2, pact: true })).toThrow(CommandError);
    expect(run(a, { type: 'restore_slot', level: 3, pact: true }).state.pactSlotsUsed).toBe(1);
    const rested = run(a, { type: 'short_rest', hitDice: [] }).state;
    expect(rested.pactSlotsUsed).toBe(0);
    expect(compute(setup('09').g.build, rested, mini, setup('09').g.rules).spellcasting.pact?.used).toBe(0);
  });
  it('ресурсы: трата, нехватка, восстановление', () => {
    const { state, run } = setup('06');
    const a = run(state, { type: 'use_resource', id: 'ki', amount: 4 }).state;
    expect(a.resourcesUsed.ki).toBe(4);
    expect(() => run(a, { type: 'use_resource', id: 'ki', amount: 3 })).toThrow(CommandError);
    expect(run(a, { type: 'restore_resource', id: 'ki', amount: 2 }).state.resourcesUsed.ki).toBe(2);
    expect(() => run(a, { type: 'use_resource', id: 'nope' })).toThrow(CommandError);
  });
  it('переключатель со стоимостью списывает ресурс; без ресурса — ошибка', () => {
    const { state, run } = setup('05', { toggles: [], resourcesUsed: {} });
    const on = run(state, { type: 'set_toggle', id: 'raging', on: true }).state;
    expect(on.toggles).toContain('raging');
    expect(on.resourcesUsed.rage).toBe(1);
    const off = run(on, { type: 'set_toggle', id: 'raging', on: false }).state;
    expect(off.toggles).not.toContain('raging');
    const empty = { ...state, resourcesUsed: { rage: 3 } };
    expect(() => run(empty, { type: 'set_toggle', id: 'raging', on: true })).toThrow(CommandError);
    expect(() => run(state, { type: 'set_toggle', id: 'nope', on: true })).toThrow(CommandError);
  });
  it('использование дарованного заклинания без лимита не меняет состояние', () => {
    const { state, run } = setup('03');
    const id = compute(setup('03').g.build, state, mini, setup('03').g.rules).spellcasting.grants[0]!.id;
    expect(run(state, { type: 'use_grant', id }).state.grantUsesUsed).toEqual({});
    expect(() => run(state, { type: 'use_grant', id: 'x' })).toThrow(CommandError);
  });
});

describe('команды: состояния, концентрация, отдых', () => {
  it('состояния и иммунитеты, истощение', () => {
    const { state, run } = setup('01');
    const a = run(state, { type: 'add_condition', condition: 'poisoned' }).state;
    expect(a.conditions).toEqual(['poisoned']);
    expect(run(a, { type: 'remove_condition', condition: 'poisoned' }).state.conditions).toEqual([]);
    const e = run(state, { type: 'add_condition', condition: 'exhaustion' }).state;
    expect(e.exhaustion).toBe(1);
    expect(run(e, { type: 'remove_condition', condition: 'exhaustion' }).state.exhaustion).toBe(0);
    const six = run(state, { type: 'set_exhaustion', level: 6 });
    expect(six.state.deathSaves.dead).toBe(true);
    const berserk = setup('05', { toggles: ['raging'] });
    const g05 = golden('05');
    g05.build.levels.push({ classKey: 'mini/class/barbarian', hp: { method: 'average' } });
    expect(() =>
      applyCommand(g05.build, berserk.state, { type: 'add_condition', condition: 'frightened' }, mini, g05.rules),
    ).toThrow(CommandError);
  });
  it('концентрация на новом заклинании завершает старую', () => {
    const { state, run } = setup('02');
    const a = run(state, { type: 'concentrate', spellKey: 'mini/spell/bless' }).state;
    const b = run(a, { type: 'concentrate', spellKey: 'mini/spell/detect-magic' });
    expect(b.events).toContainEqual({ type: 'concentration_ended', spellKey: 'mini/spell/bless' });
    const c = run(b.state, { type: 'drop_concentration' });
    expect(c.state.concentration).toBeUndefined();
  });
  it('короткий отдых: кости хитов + Тел, ресурсы short', () => {
    const { state, run } = setup('06', { hp: { current: 10, temp: 0 }, resourcesUsed: { ki: 6, 'wholeness-of-body': 1 } });
    const r = run(state, { type: 'short_rest', hitDice: [{ die: 8, roll: 5 }, { die: 8, roll: 1 }] }).state;
    expect(r.hp.current).toBe(10 + 7 + 3);
    expect(r.hitDiceUsed.d8).toBe(2);
    expect(r.resourcesUsed.ki).toBe(0);
    expect(r.resourcesUsed['wholeness-of-body']).toBe(1);
    expect(() => run(state, { type: 'short_rest', hitDice: [{ die: 10, roll: 5 }] })).toThrow(CommandError);
    expect(() => run(state, { type: 'short_rest', hitDice: [{ die: 8, roll: 9 }] })).toThrow(CommandError);
    const all = { ...state, hitDiceUsed: { d6: 0, d8: 6, d10: 0, d12: 0 } };
    expect(() => run(all, { type: 'short_rest', hitDice: [{ die: 8, roll: 3 }] })).toThrow(CommandError);
  });
  it('долгий отдых: хиты, половина костей (минимум 1), ячейки, ресурсы, истощение −1', () => {
    const { state, run } = setup('06', {
      hp: { current: 3, temp: 4 },
      hitDiceUsed: { d6: 0, d8: 6, d10: 0, d12: 0 },
      resourcesUsed: { ki: 6, 'wholeness-of-body': 1 },
      exhaustion: 2,
      toggles: ['spell:x'],
      concentration: { spellKey: 'mini/spell/bless', sinceIso: '' },
    });
    const r = run(state, { type: 'long_rest' });
    expect(r.state.hp).toEqual({ current: 45, temp: 0 });
    expect(r.state.hitDiceUsed.d8).toBe(3);
    expect(r.state.resourcesUsed).toEqual({ ki: 0, 'wholeness-of-body': 0 });
    expect(r.state.exhaustion).toBe(1);
    expect(r.state.concentration).toBeUndefined();
    expect(r.state.toggles).toEqual([]);
    const one = setup('01', { hitDiceUsed: { d6: 0, d8: 0, d10: 1, d12: 0 } });
    expect(one.run(one.state, { type: 'long_rest' }).state.hitDiceUsed.d10).toBe(0);
  });
  it('новый день: ресурсы с reset dawn', () => {
    const { state, run } = setup('01');
    expect(run(state, { type: 'new_day' }).state).toEqual(state);
  });
});

describe('команды: опыт, монеты, инвентарь, подготовка', () => {
  it('опыт и событие о повышении', () => {
    const { state, run } = setup('01');
    const r = run(state, { type: 'gain_xp', amount: 300 });
    expect(r.state.xp).toBe(300);
    expect(r.events).toContainEqual({ type: 'level_up_available' });
    expect(run(state, { type: 'gain_xp', amount: -50 }).state.xp).toBe(0);
    expect(run(state, { type: 'set_xp', xp: 1000 }).state.xp).toBe(1000);
  });
  it('монеты', () => {
    const { state, run } = setup('01');
    const a = run(state, { type: 'set_currency', currency: { cp: 0, sp: 5, ep: 0, gp: 10, pp: 0 } }).state;
    expect(run(a, { type: 'add_currency', currency: { gp: -3 } }).state.currency.gp).toBe(7);
    expect(() => run(a, { type: 'add_currency', currency: { gp: -30 } })).toThrow(CommandError);
  });
  it('инвентарь: добавить, изменить, убрать часть и целиком', () => {
    const { state, run } = setup('01');
    const a = run(state, { type: 'inventory_add', item: { key: 'mini/gear/iron-ingot', qty: 5, equipped: false, attuned: false } }).state;
    const added = a.inventory.at(-1)!;
    expect(added.id).toMatch(/^i\d+$/);
    const b = run(a, { type: 'inventory_update', id: added.id, patch: { qty: 7 } }).state;
    expect(b.inventory.at(-1)!.qty).toBe(7);
    expect(run(b, { type: 'inventory_remove', id: added.id, qty: 2 }).state.inventory.at(-1)!.qty).toBe(5);
    expect(run(b, { type: 'inventory_remove', id: added.id }).state.inventory.length).toBe(3);
    expect(() => run(b, { type: 'inventory_remove', id: 'zzz' })).toThrow(CommandError);
    expect(() => run(b, { type: 'inventory_update', id: 'zzz', patch: {} })).toThrow(CommandError);
    expect(() => run(b, { type: 'inventory_add', item: { key: 'mini/gear/nope', qty: 1, equipped: false, attuned: false } })).toThrow(CommandError);
    const unequipped = run(b, { type: 'inventory_update', id: 'i2', patch: { equipped: false } }).state;
    expect(unequipped.inventory.find((i) => i.id === 'i2')!.hand).toBeUndefined();
    const withCharges = run(b, { type: 'set_charges', id: 'i1', charges: 3 }).state;
    expect(withCharges.inventory[0]!.charges).toBe(3);
    expect(() => run(b, { type: 'set_charges', id: 'zz', charges: 1 })).toThrow(CommandError);
  });
  it('подготовка заклинаний и вдохновение', () => {
    const { state, run } = setup('02');
    const s = run(state, { type: 'set_prepared', classKey: 'mini/class/cleric', spells: ['mini/spell/bless', 'mini/spell/bless'] }).state;
    expect(s.prepared['mini/class/cleric']).toEqual(['mini/spell/bless']);
    expect(run(state, { type: 'set_inspiration', value: true }).state.inspiration).toBe(true);
  });
  it('мёртвого нельзя ранить или вылечить', () => {
    const { state, run } = setup('01', { deathSaves: { successes: 0, failures: 3, stable: false, dead: true }, hp: { current: 0, temp: 0 } });
    expect(run(state, { type: 'damage', amount: 5 }).state).toEqual(state);
    expect(run(state, { type: 'heal', amount: 5 }).state.hp.current).toBe(0);
    expect(run(state, { type: 'death_save', result: 'success' }).state).toEqual(state);
    expect(run(state, { type: 'long_rest' }).state.hp.current).toBe(0);
  });
});

describe('состояние после сохранения сборки', () => {
  it('завершение конструктора — полные хиты; изменение максимума двигает текущие хиты', () => {
    const g = golden('01');
    const draft = { ...g.build, status: 'draft' as const };
    const ready = { ...g.build, status: 'ready' as const };
    expect(stateAfterBuildChange(draft, g.state, draft, mini, g.rules)).toBe(g.state);
    const started = stateAfterBuildChange(draft, { ...g.state, hp: { current: 0, temp: 0 } }, ready, mini, g.rules);
    expect(started.hp.current).toBe(12);

    const wounded = { ...started, hp: { current: 5, temp: 0 } };
    const tougher = { ...ready, abilities: { ...ready.abilities, base: { ...ready.abilities.base, con: ready.abilities.base.con + 2 } } };
    expect(compute(tougher, wounded, mini, g.rules).hp.max.value).toBe(13);
    expect(stateAfterBuildChange(ready, wounded, tougher, mini, g.rules).hp.current).toBe(6);
    expect(stateAfterBuildChange(tougher, { ...wounded, hp: { current: 0, temp: 0 } }, ready, mini, g.rules).hp.current).toBe(0);
    expect(stateAfterBuildChange(ready, wounded, ready, mini, g.rules)).toBe(wounded);
    const dead = { ...wounded, deathSaves: { successes: 0, failures: 3, stable: false, dead: true } };
    expect(stateAfterBuildChange(ready, dead, tougher, mini, g.rules)).toBe(dead);
  });
});
