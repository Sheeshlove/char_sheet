import { describe, expect, it } from 'vitest';
import {
  characterBuildSchema,
  characterStateSchema,
  effectSchema,
  emptyBuild,
  emptyState,
  featureSchema,
  normalizeDice,
  parseContentKey,
  parseEntityData,
  predicateSchema,
  stateCommandSchema,
} from '../src';

describe('effectSchema', () => {
  it('принимает эталонные эффекты из SPEC §6.5', () => {
    const rage = [
      { type: 'resource', id: 'rage', nameRu: 'Ярость', max: 'col("rages")', reset: 'long' },
      {
        type: 'toggle',
        id: 'raging',
        labelRu: 'В ярости',
        cost: { resource: 'rage', amount: 1 },
        effects: [
          { type: 'roll_mode', mode: 'advantage', target: 'check:str', noteRu: 'Проверки Силы' },
          {
            type: 'bonus',
            target: 'damage:melee_weapon',
            value: 'col("rage_damage")',
            when: { all: [{ not: { armor: 'heavy' } }, { attackAbility: 'str' }] },
            labelRu: 'Урон ярости',
          },
          { type: 'defense', kind: 'resistance', damageType: 'bludgeoning' },
        ],
      },
      {
        type: 'choice',
        id: 'tool',
        labelRu: 'Инструменты',
        choose: 1,
        options: {
          kind: 'list',
          items: [{ value: 'smiths-tools', labelRu: 'Кузнец', effects: [{ type: 'proficiency', target: 'tool:smiths-tools', level: 'proficient' }] }],
        },
      },
    ];
    for (const e of rage) expect(effectSchema.safeParse(e).success).toBe(true);
  });

  it('строгая схема: неизвестные поля — ошибка', () => {
    expect(effectSchema.safeParse({ type: 'size', size: 'small', extra: 1 }).success).toBe(false);
    expect(effectSchema.safeParse({ type: 'nope' }).success).toBe(false);
  });

  it('проверяет цели бонусов, владений и режимов броска', () => {
    expect(effectSchema.safeParse({ type: 'bonus', target: 'skill:stealth', value: '1' }).success).toBe(true);
    expect(effectSchema.safeParse({ type: 'bonus', target: 'skill:flying', value: '1' }).success).toBe(false);
    expect(effectSchema.safeParse({ type: 'proficiency', target: 'weapon:light-hammer', level: 'proficient' }).success).toBe(true);
    expect(effectSchema.safeParse({ type: 'roll_mode', mode: 'advantage', target: 'death_save', noteRu: 'x' }).success).toBe(true);
    expect(effectSchema.safeParse({ type: 'roll_mode', mode: 'advantage', target: 'attacks_against_you', noteRu: 'x' }).success).toBe(true);
  });

  it('предикаты вложенные', () => {
    expect(predicateSchema.safeParse({ any: [{ toggle: 'x' }, 'LEVEL >= 5', { not: { shield: true } }] }).success).toBe(true);
    expect(predicateSchema.safeParse({ armor: 'plate' }).success).toBe(false);
  });

  it('умение', () => {
    expect(
      featureSchema.safeParse({ key: 'rage', nameRu: 'Ярость', textMd: '', effects: [], effectsStatus: 'text_only' }).success,
    ).toBe(true);
  });
});

describe('сущности и персонаж', () => {
  it('данные оружия', () => {
    const r = parseEntityData('weapon', {
      category: 'martial',
      range: 'melee',
      damage: { dice: '1d8', type: 'slashing' },
      versatileDice: '1d10',
      properties: ['versatile'],
      costCp: 1500,
      weightLb: 3,
      monkWeapon: false,
    });
    expect(r.success).toBe(true);
  });

  it('пустые сборка и состояние валидны', () => {
    expect(characterBuildSchema.safeParse(emptyBuild('Тест')).success).toBe(true);
    expect(characterStateSchema.safeParse(emptyState()).success).toBe(true);
  });

  it('команды', () => {
    expect(stateCommandSchema.safeParse({ type: 'damage', amount: 5, damageType: 'fire' }).success).toBe(true);
    expect(stateCommandSchema.safeParse({ type: 'short_rest', hitDice: [{ die: 8, roll: 5 }] }).success).toBe(true);
    expect(stateCommandSchema.safeParse({ type: 'short_rest', hitDice: [{ die: 7, roll: 5 }] }).success).toBe(false);
  });

  it('служебные функции', () => {
    expect(normalizeDice('1к6')).toBe('1d6');
    expect(parseContentKey('srd/weapon/longsword')).toEqual({ pack: 'srd', kind: 'weapon', slug: 'longsword' });
  });
});
