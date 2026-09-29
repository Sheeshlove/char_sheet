import { describe, expect, it } from 'vitest';
import { compute } from '../src';
import { mini } from './fixtures/content-mini';
import { getPath, loadGoldens } from './golden-runner';

/** Эталонные персонажи 01–24 на мини-наборе контента (SPEC §8.13). */
describe('эталонные персонажи (мини-набор)', () => {
  const goldens = loadGoldens();
  it('найдены все 24 эталона', () => {
    expect(goldens.length).toBe(24);
  });
  for (const g of goldens) {
    describe(`${g.id}: ${g.title}`, () => {
      const sheet = compute(g.build, g.state, mini, g.rules);
      for (const [path, value] of Object.entries(g.expected)) {
        it(path, () => {
          expect(getPath(sheet, path)).toEqual(value);
        });
      }
    });
  }
});
