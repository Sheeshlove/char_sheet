import { describe, expect, it } from 'vitest';
import { castingTime, duration, spellRange } from '../src/srd/convert-spells';
import { slugify, toCp, translitSlug } from '../src/util/text';
import { stableStringify } from '../src/util/json';
import { applyOverlays } from '../src/overlays';
import type { ContentEntity } from '@ps/content-schema';

describe('разбор полей заклинаний SRD', () => {
  it('время накладывания', () => {
    expect(castingTime('1 action')).toEqual({ textRu: '1 действие', unit: 'action', amount: 1 });
    expect(castingTime('1 bonus action')).toMatchObject({ unit: 'bonus_action' });
    expect(castingTime('1 reaction, which you take when you are hit')).toMatchObject({ unit: 'reaction' });
    expect(castingTime('10 minutes')).toEqual({ textRu: '10 минут', unit: 'minute', amount: 10 });
    expect(castingTime('1 hour')).toEqual({ textRu: '1 час', unit: 'hour', amount: 1 });
    expect(castingTime('8 hours')).toEqual({ textRu: '8 часов', unit: 'hour', amount: 8 });
    expect(castingTime('special')).toMatchObject({ unit: 'special' });
  });
  it('дистанция', () => {
    expect(spellRange('60 feet')).toEqual({ textRu: '60 футов', feet: 60, kind: 'ranged' });
    expect(spellRange('Self')).toEqual({ textRu: 'На себя', kind: 'self' });
    expect(spellRange('Self (15-foot cone)')).toEqual({ textRu: 'На себя (конус 15 футов)', kind: 'self' });
    expect(spellRange('Touch')).toMatchObject({ kind: 'touch' });
    expect(spellRange('Sight')).toMatchObject({ kind: 'sight' });
    expect(spellRange('Unlimited')).toMatchObject({ kind: 'unlimited' });
    expect(spellRange('1 mile')).toEqual({ textRu: '1 миля', feet: 5280, kind: 'ranged' });
    expect(spellRange('Special')).toEqual({ textRu: 'Особая', kind: 'special' });
  });
  it('длительность', () => {
    expect(duration('Up to 1 minute', true)).toEqual({ textRu: 'Концентрация, вплоть до 1 минуты', concentration: true });
    expect(duration('Up to 8 hours', true)).toEqual({ textRu: 'Концентрация, вплоть до 8 часов', concentration: true });
    expect(duration('Instantaneous', false)).toEqual({ textRu: 'Мгновенная', concentration: false });
    expect(duration('1 round', false).textRu).toBe('1 раунд');
    expect(duration('24 hours', false).textRu).toBe('24 часа');
    expect(duration('10 days', false).textRu).toBe('10 дней');
    expect(duration('Until dispelled', false).textRu).toBe('Пока не рассеется');
  });
});

describe('служебные функции импорта', () => {
  it('slug и транслитерация', () => {
    expect(slugify("Hunter's Mark")).toBe('hunters-mark');
    expect(translitSlug('Ярость берсерка')).toBe('yarost-berserka');
  });
  it('цена в медных', () => {
    expect(toCp({ quantity: 15, unit: 'gp' })).toBe(1500);
    expect(toCp({ quantity: 2, unit: 'sp' })).toBe(20);
    expect(toCp(undefined)).toBe(0);
  });
  it('стабильный JSON', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe('{\n  "a": {\n    "c": 3,\n    "d": 2\n  },\n  "b": 1\n}\n');
  });
});

describe('оверлеи', () => {
  it('заменяют эффекты умений и пересчитывают статус', () => {
    const entity = {
      key: 'srd/class/x',
      kind: 'class',
      slug: 'x',
      nameRu: 'X',
      effectsStatus: 'text_only',
      data: { features: [{ key: 'rage', nameRu: 'Ярость', textMd: '', effects: [], effectsStatus: 'text_only' }] },
    } as unknown as ContentEntity;
    const warnings = applyOverlays(
      [entity],
      [
        {
          target: 'srd/class/x',
          features: { rage: { effects: [{ type: 'extra_attack', attacks: 1 }] }, nope: { effects: [] } },
        },
        { target: 'srd/class/missing' },
      ],
    );
    expect(entity.effectsStatus).toBe('complete');
    expect(warnings).toHaveLength(2);
  });
});
