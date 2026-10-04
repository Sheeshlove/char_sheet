import { describe, expect, it } from 'vitest';
import { ENTITY_DATA_SCHEMAS } from '@ps/content-schema';
import { defaultOf, unionIndex, def, resolve } from '@/features/homebrew/zod-walk';
import { entityEffects } from '@/features/homebrew/preview';
import { effectsStatusOf, makeSlug, overlayOf, parseHomebrewData } from './homebrew';

const feat = {
  repeatable: false,
  features: [
    {
      key: 'alert',
      nameRu: 'Бдительность',
      textMd: '+2 к инициативе',
      effects: [{ type: 'bonus', target: 'initiative', value: '2' }],
      effectsStatus: 'text_only',
    },
  ],
};

describe('homebrew', () => {
  it('слаг: транслитерация и случайный хвост', () => {
    expect(makeSlug('Бдительный страж')).toMatch(/^bditelnyy-strazh-[0-9a-f]{6}$/);
    expect(makeSlug('???')).toMatch(/^entity-[0-9a-f]{6}$/);
    expect(makeSlug('Щит')).not.toBe(makeSlug('Щит'));
  });

  it('данные проверяются схемой вида; статус автоматизации считается по эффектам', () => {
    const ok = parseHomebrewData('feat', feat);
    expect(ok.success).toBe(true);
    if (ok.success) expect((ok.data as typeof feat).features[0]!.effectsStatus).toBe('complete');
    expect(parseHomebrewData('feat', { ...feat, extra: 1 }).success).toBe(false);
    expect(effectsStatusOf('feat', feat)).toBe('complete');
    expect(effectsStatusOf('feat', { ...feat, features: [{ ...feat.features[0], effects: [] }] })).toBe('text_only');
    expect(effectsStatusOf('weapon', {})).toBe('complete');
  });

  it('оверлей для репозитория и эффекты для предпросмотра', () => {
    expect(overlayOf({ key: 'hb-x/feat/alert', data: feat })).toEqual({
      target: 'hb-x/feat/alert',
      features: { alert: { effects: feat.features[0]!.effects, effectsStatus: 'text_only', nameRu: 'Бдительность' } },
    });
    expect(entityEffects(feat)).toEqual([{ type: 'bonus', target: 'initiative', value: '2' }]);
  });

  it('значения по умолчанию из zod-схемы проходят проверку схемы вида', () => {
    for (const kind of ['feat', 'language', 'armor', 'weapon', 'gear', 'condition', 'feature'] as const) {
      const r = ENTITY_DATA_SCHEMAS[kind].safeParse(defaultOf(ENTITY_DATA_SCHEMAS[kind]));
      expect(r.success, kind).toBe(true);
    }
    // Эффект по умолчанию — первый вариант объединения; вариант определяется по дискриминатору.
    const effects = def(resolve(ENTITY_DATA_SCHEMAS.feat)).shape!.features!;
    const effectSchema = def(def(resolve(def(resolve(effects)).element!)).shape!.effects!).element!;
    const union = def(resolve(effectSchema));
    expect(unionIndex(union.options!, { type: 'bonus', target: 'ac', value: '1' }, union.discriminator)).toBeGreaterThan(0);
  });
});
