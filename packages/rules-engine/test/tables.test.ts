import { describe, expect, it } from 'vitest';
import {
  abilityMod,
  cantripMultiplier,
  diceAverage,
  diceRu,
  formatDice,
  levelForXp,
  maxDice,
  maxSpellLevelFor,
  multiclassCasterContribution,
  nextLevelXp,
  pactSlots,
  parseDice,
  pointBuyCost,
  proficiencyBonus,
  rollTotal,
  scaleDice,
  shiftSize,
  singleClassCasterLevel,
  slotsForCasterLevel,
} from '../src';

describe('таблицы правил 2014 (SPEC §8.12)', () => {
  it('бонус мастерства', () => {
    expect([1, 4, 5, 8, 9, 12, 13, 16, 17, 20].map(proficiencyBonus)).toEqual([2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
  });
  it('опыт', () => {
    expect(nextLevelXp(1)).toBe(300);
    expect(nextLevelXp(4)).toBe(6500);
    expect(nextLevelXp(19)).toBe(355000);
    expect(nextLevelXp(20)).toBeNull();
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(900)).toBe(3);
    expect(levelForXp(400000)).toBe(20);
  });
  it('покупка очков и броски', () => {
    expect(pointBuyCost({ str: 15, dex: 15, con: 15, int: 8, wis: 8, cha: 8 })).toBe(27);
    expect(pointBuyCost({ str: 16, dex: 8, con: 8, int: 8, wis: 8, cha: 8 })).toBeNull();
    expect(rollTotal([6, 1, 4, 3])).toBe(13);
    expect(rollTotal([3, 3])).toBe(6);
    expect(abilityMod(9)).toBe(-1);
    expect(abilityMod(20)).toBe(5);
  });
  it('ячейки и прогрессии', () => {
    expect(slotsForCasterLevel(0)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(slotsForCasterLevel(5)).toEqual([4, 3, 2, 0, 0, 0, 0, 0, 0]);
    expect(singleClassCasterLevel('half', 1)).toBe(0);
    expect(singleClassCasterLevel('half_up', 1)).toBe(1);
    expect(singleClassCasterLevel('third', 2)).toBe(0);
    expect(singleClassCasterLevel('pact', 5)).toBe(0);
    expect(multiclassCasterContribution('third', 7)).toBe(2);
    expect(multiclassCasterContribution('half_up', 3)).toBe(2);
    expect(multiclassCasterContribution('pact', 3)).toBe(0);
    expect(maxSpellLevelFor('pact', 9)).toBe(5);
    expect(maxSpellLevelFor('half', 1)).toBe(0);
    expect([1, 2, 3, 5, 7, 9, 11, 17].map((l) => pactSlots(l))).toEqual([
      { count: 1, level: 1 },
      { count: 2, level: 1 },
      { count: 2, level: 2 },
      { count: 2, level: 3 },
      { count: 2, level: 4 },
      { count: 2, level: 5 },
      { count: 3, level: 5 },
      { count: 4, level: 5 },
    ]);
    expect(pactSlots(0)).toEqual({ count: 0, level: 0 });
  });
  it('кости', () => {
    expect(parseDice('2к6')).toEqual({ count: 2, sides: 6 });
    expect(parseDice('d8')).toEqual({ count: 1, sides: 8 });
    expect(parseDice('x')).toBeNull();
    expect(parseDice(undefined)).toBeNull();
    expect(formatDice({ count: 3, sides: 4 })).toBe('3d4');
    expect(diceAverage({ count: 2, sides: 6 })).toBe(7);
    expect(maxDice('1d6', '1d8')).toBe('1d8');
    expect(maxDice('bad', '1d8')).toBe('1d8');
    expect(maxDice('1d8', 'bad')).toBe('1d8');
    expect([1, 5, 11, 17].map(cantripMultiplier)).toEqual([1, 2, 3, 4]);
    expect(scaleDice('1d10', 3)).toBe('3d10');
    expect(scaleDice('x', 3)).toBe('x');
    expect(diceRu('2d6')).toBe('2к6');
  });
  it('размеры', () => {
    expect(shiftSize('medium', 1)).toBe('large');
    expect(shiftSize('tiny', -3)).toBe('tiny');
  });
});
