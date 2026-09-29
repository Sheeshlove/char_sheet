import type { ContentEntity, ContentKind } from '@ps/content-schema';

/**
 * Индекс контента (SPEC §8.1): сущности по ключу + индексы по виду и спискам заклинаний.
 * Строится из массива сущностей (без `textMd`), одинаково на сервере и в браузере.
 */
export class ContentIndex {
  private readonly map = new Map<string, ContentEntity>();
  private readonly kinds = new Map<ContentKind, ContentEntity[]>();
  private readonly lists = new Map<string, string[]>();

  constructor(entities: Iterable<ContentEntity>) {
    for (const e of entities) this.add(e);
  }

  private add(e: ContentEntity) {
    this.map.set(e.key, e);
    const arr = this.kinds.get(e.kind);
    if (arr) arr.push(e);
    else this.kinds.set(e.kind, [e]);
    if (e.kind === 'spell') {
      for (const list of e.data.classes) {
        const l = this.lists.get(list);
        if (l) l.push(e.key);
        else this.lists.set(list, [e.key]);
      }
    }
  }

  get size() {
    return this.map.size;
  }

  get(key: string | undefined | null): ContentEntity | undefined {
    return key ? this.map.get(key) : undefined;
  }

  getOf<K extends ContentKind>(key: string | undefined | null, kind: K): ContentEntity<K> | undefined {
    const e = this.get(key);
    return e && e.kind === kind ? (e as ContentEntity<K>) : undefined;
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  byKind<K extends ContentKind>(kind: K): ContentEntity<K>[] {
    return (this.kinds.get(kind) ?? []) as ContentEntity<K>[];
  }

  /** Ключи заклинаний списка класса (`SpellData.classes`). */
  spellList(listKey: string): string[] {
    return this.lists.get(listKey) ?? [];
  }

  all(): ContentEntity[] {
    return [...this.map.values()];
  }

  /** Поиск по slug среди сущностей вида (для владений `weapon:longsword` и т. п.). */
  bySlug<K extends ContentKind>(kind: K, slug: string): ContentEntity<K> | undefined {
    return this.byKind(kind).find((e) => e.slug === slug);
  }
}

export function createContentIndex(entities: Iterable<ContentEntity>): ContentIndex {
  return new ContentIndex(entities);
}
