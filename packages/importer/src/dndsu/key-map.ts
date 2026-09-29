import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { contentDataDir } from '@ps/content-data';
import type { ContentKind } from '@ps/content-schema';

export type KeyMapFile = {
  version: 1;
  /** Внешний ключ страницы (`spells/205`, `homebrew/class/853`) → ключ сущности. */
  entities: Record<string, string>;
  /** Ключ сущности → (заголовок блока умения → Feature.key). */
  features: Record<string, Record<string, string>>;
};

export function defaultKeyMapPath(): string {
  return join(contentDataDir(), 'dndsu', 'key-map.json');
}

function sanitizeSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9._~-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Неизменяемое соответствие «страница dnd.su → ключ сущности» (SPEC §7.4).
 * Однажды выданный ключ больше не меняется, даже если у страницы изменился slug.
 */
export class KeyMap {
  readonly data: KeyMapFile;
  private readonly taken = new Set<string>();
  private readonly takenFeatures = new Map<string, Set<string>>();
  private dirty = false;

  constructor(data?: KeyMapFile) {
    this.data = data ?? { version: 1, entities: {}, features: {} };
    for (const k of Object.values(this.data.entities)) this.taken.add(k);
    for (const [ek, map] of Object.entries(this.data.features)) this.takenFeatures.set(ek, new Set(Object.values(map)));
  }

  static load(path = defaultKeyMapPath()): KeyMap {
    return new KeyMap(existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as KeyMapFile) : undefined);
  }

  get changed() {
    return this.dirty;
  }

  /** Ключ сущности для страницы; при повторе slug в пакете и виде — `slug-<externalId>`. */
  entityKey(extKey: string, pack: string, kind: ContentKind, slug: string, externalId: number): string {
    const existing = this.data.entities[extKey];
    if (existing) return existing;
    const s = sanitizeSlug(slug) || String(externalId);
    let key = `${pack}/${kind}/${s}`;
    if (this.taken.has(key)) key = `${pack}/${kind}/${s}-${externalId}`;
    let n = 2;
    while (this.taken.has(key)) key = `${pack}/${kind}/${s}-${externalId}-${n++}`;
    this.data.entities[extKey] = key;
    this.taken.add(key);
    this.dirty = true;
    return key;
  }

  /** Ключ умения внутри сущности; уникален в пределах сущности и не меняется. */
  featureKey(entityKey: string, blockId: string, candidate: string): string {
    const map = (this.data.features[entityKey] ??= {});
    const existing = map[blockId];
    if (existing) return existing;
    const taken = this.takenFeatures.get(entityKey) ?? new Set<string>();
    this.takenFeatures.set(entityKey, taken);
    const base = sanitizeSlug(candidate) || 'feature';
    let key = base;
    let n = 2;
    while (taken.has(key)) key = `${base}-${n++}`;
    map[blockId] = key;
    taken.add(key);
    this.dirty = true;
    return key;
  }

  save(path = defaultKeyMapPath()) {
    mkdirSync(dirname(path), { recursive: true });
    const sorted: KeyMapFile = {
      version: 1,
      entities: Object.fromEntries(Object.entries(this.data.entities).sort(([a], [b]) => a.localeCompare(b))),
      features: Object.fromEntries(
        Object.entries(this.data.features)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))]),
      ),
    };
    writeFileSync(path, `${JSON.stringify(sorted, null, 2)}\n`);
    this.dirty = false;
  }
}
