import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { listFixtures, parseFixture } from '../src/dndsu/fixtures';

/**
 * Снапшот-тесты парсеров на сохранённых страницах dnd.su (SPEC §7.3, §7.5).
 * `fixtures/<section>/<id>-<slug>.html` + `.expected.json`, проверенный человеком.
 * Образцов пока нет: доступ к dnd.su из среды разработки закрыт (см. PROGRESS.md).
 */
const fixtures = listFixtures();

describe.skipIf(fixtures.length === 0)('парсеры dnd.su на образцах', () => {
  for (const f of fixtures) {
    it(f.file.split('/fixtures/')[1]!, () => {
      expect(existsSync(f.expectedPath), `нет ${f.expectedPath}: pnpm import:dndsu fixtures --drafts`).toBe(true);
      const expected = JSON.parse(readFileSync(f.expectedPath, 'utf8'));
      expect(JSON.parse(JSON.stringify(parseFixture(f)))).toEqual(expected);
    });
  }
});

it('образцы страниц: список читается', () => {
  expect(Array.isArray(fixtures)).toBe(true);
});
