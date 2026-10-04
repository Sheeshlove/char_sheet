import {
  DEFAULT_CAMPAIGN_SETTINGS,
  emptyBuild,
  emptyState,
  type CampaignSettings,
  type CharacterBuild,
  type CharacterState,
} from '@ps/content-schema';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const GOLDEN_DIR = join(import.meta.dirname, 'golden');

export type GoldenInput = {
  title: string;
  build: Partial<CharacterBuild>;
  state?: Partial<CharacterState>;
  rules?: Partial<CampaignSettings>;
};

export type Golden = {
  id: string;
  title: string;
  build: CharacterBuild;
  state: CharacterState;
  rules: CampaignSettings;
  expected: Record<string, unknown>;
};

export function loadGoldens(): Golden[] {
  return readdirSync(GOLDEN_DIR)
    .filter((f) => f.endsWith('.input.json'))
    .sort()
    .map((f) => {
      const id = f.replace('.input.json', '');
      const input = JSON.parse(readFileSync(join(GOLDEN_DIR, f), 'utf8')) as GoldenInput;
      const expected = JSON.parse(readFileSync(join(GOLDEN_DIR, `${id}.expected.json`), 'utf8')) as Record<string, unknown>;
      return {
        id,
        title: input.title,
        build: { ...emptyBuild(), ...input.build } as CharacterBuild,
        state: { ...emptyState(), ...input.state } as CharacterState,
        rules: { ...DEFAULT_CAMPAIGN_SETTINGS, ...input.rules },
        expected,
      };
    });
}

/** Значение по пути `a.b.0.c`, `list[field=value].x` или `list.length`. */
export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  const segs = path.match(/[^.[\]]+(\[[^\]]+\])?/g) ?? [];
  for (const seg of segs) {
    if (cur === undefined || cur === null) return undefined;
    const m = /^([^[]+)\[([^=\]]+)=([^\]]+)\]$/.exec(seg);
    if (m) {
      const list = (cur as Record<string, unknown>)[m[1]!];
      if (!Array.isArray(list)) return undefined;
      cur = list.find((x) => String((x as Record<string, unknown>)[m[2]!]) === m[3]);
      continue;
    }
    if (seg === 'length' && Array.isArray(cur)) {
      cur = cur.length;
      continue;
    }
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}
