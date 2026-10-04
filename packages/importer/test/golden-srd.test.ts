import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentDataDir, readPack } from '@ps/content-data';
import type { ContentEntity } from '@ps/content-schema';
import { compute, createContentIndex } from '@ps/rules-engine';
import { MINI_ENTITIES } from '../../rules-engine/test/fixtures/content-mini';
import { getPath, loadGoldens } from '../../rules-engine/test/golden-runner';

/**
 * Эталоны 01–24 на реальном пакете `srd` с оверлеями (SPEC §17 M6).
 * Ключи мини-набора переводятся по `rules-engine/test/fixtures/key-aliases.json`.
 */
type Aliases = {
  keys: Record<string, string>;
  choiceKeys: Record<string, string>;
  fromMini: string[];
  extraChoices: Record<string, Record<string, string[]>>;
  skip: Record<string, string>;
};

const aliases = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', '..', 'rules-engine', 'test', 'fixtures', 'key-aliases.json'), 'utf8'),
) as Aliases;

const keyRe = new RegExp(
  Object.keys(aliases.keys)
    .sort((a, b) => b.length - a.length)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|') + '(?![a-z0-9-])',
  'g',
);

function translate<T>(value: T): T {
  return JSON.parse(JSON.stringify(value).replace(keyRe, (k) => aliases.keys[k]!)) as T;
}

const srd = readPack(join(contentDataDir(), 'srd')).entities;
const fallback = translate(MINI_ENTITIES.filter((e) => aliases.fromMini.includes(e.key))) as ContentEntity[];
const index = createContentIndex([...srd, ...fallback]);

describe('эталонные персонажи на пакете srd', () => {
  const goldens = loadGoldens();

  it('все сущности из fromMini действительно отсутствуют в SRD и есть в мини-наборе', () => {
    expect(fallback.map((e) => e.key).sort()).toEqual([...aliases.fromMini].sort());
  });

  for (const g of goldens) {
    const reason = aliases.skip[g.id];
    if (reason) {
      it.skip(`${g.id}: ${reason}`, () => {});
      continue;
    }
    describe(`${g.id}: ${g.title}`, () => {
      const build = translate(g.build);
      build.choices = Object.fromEntries(
        Object.entries(build.choices).map(([k, v]) => [aliases.choiceKeys[k] ?? k, v]),
      );
      Object.assign(build.choices, aliases.extraChoices[g.id] ?? {});
      const sheet = compute(build, translate(g.state), index, g.rules);
      for (const [path, value] of Object.entries(translate(g.expected))) {
        it(path, () => {
          expect(getPath(sheet, path)).toEqual(value);
        });
      }
    });
  }
});
