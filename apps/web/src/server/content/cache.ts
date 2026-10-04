import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { CampaignSettings, ContentEntity } from '@ps/content-schema';
import { createContentIndex, type ContentIndex } from '@ps/rules-engine';
import type { Db } from '../db/client';
import { contentEntities, contentPacks } from '../db/schema';

/**
 * ContentIndex в памяти процесса (SPEC §3 `content-cache.ts`): все сущности без `text_md`.
 * Сбрасывается после `content:load` и изменений homebrew.
 */
type CachedEntity = ContentEntity & {
  packKey: string;
  status: 'draft' | 'proposed' | 'approved' | 'rejected';
  authorId: string | null;
};

type CacheState = {
  generation: number;
  entities: CachedEntity[];
  packs: Map<string, { version: string; visibility: string; campaignId: string | null; ownerUserId: string | null; name: string }>;
};

const g = globalThis as unknown as { __psContentCache?: CacheState | null; __psContentGen?: number };

export function invalidateContentCache() {
  g.__psContentCache = null;
  g.__psContentGen = (g.__psContentGen ?? 0) + 1;
}

export async function getContentCache(db: Db): Promise<CacheState> {
  if (g.__psContentCache) return g.__psContentCache;
  const generation = g.__psContentGen ?? 0;
  const [rows, packs] = await Promise.all([
    db
      .select({
        key: contentEntities.key,
        packKey: contentEntities.packKey,
        kind: contentEntities.kind,
        slug: contentEntities.slug,
        nameRu: contentEntities.nameRu,
        nameEn: contentEntities.nameEn,
        sourceBook: contentEntities.sourceBook,
        sourceUrl: contentEntities.sourceUrl,
        data: contentEntities.data,
        effectsStatus: contentEntities.effectsStatus,
        status: contentEntities.status,
        authorId: contentEntities.authorId,
        removedAt: contentEntities.removedAt,
      })
      .from(contentEntities),
    db.select().from(contentPacks),
  ]);
  const entities: CachedEntity[] = rows.map((r) => ({
    key: r.key,
    kind: r.kind,
    slug: r.slug,
    nameRu: r.nameRu,
    ...(r.nameEn ? { nameEn: r.nameEn } : {}),
    ...(r.sourceBook ? { sourceBook: r.sourceBook } : {}),
    ...(r.sourceUrl ? { sourceUrl: r.sourceUrl } : {}),
    data: r.data,
    effectsStatus: r.effectsStatus,
    ...(r.removedAt ? { removed: true } : {}),
    packKey: r.packKey,
    status: r.status,
    authorId: r.authorId,
  })) as CachedEntity[];
  const state: CacheState = {
    generation,
    entities,
    packs: new Map(
      packs.map((p) => [
        p.key,
        { version: p.version, visibility: p.visibility, campaignId: p.campaignId, ownerUserId: p.ownerUserId, name: p.name },
      ]),
    ),
  };
  if ((g.__psContentGen ?? 0) === generation) g.__psContentCache = state;
  return state;
}

export const GLOBAL_DEFAULT_PACKS = ['srd', 'dndsu-official'];

export type BundleScope = {
  userId: string;
  /** Разрешённые пакеты и источники (из настроек кампании) или null — все глобальные. */
  settings: Pick<CampaignSettings, 'allowedPacks' | 'allowedSources'> | null;
  campaignId: string | null;
};

export type ContentBundle = {
  etag: string;
  /** Сущности без `text_md`. `hidden` — не предлагать в выборе (удалено из источника или источник запрещён). */
  entities: ContentEntity[];
  hidden: string[];
  packs: { key: string; name: string; version: string }[];
};

/** Бандл контента для кампании или для личного использования (SPEC §8.1, §15). */
export async function buildBundle(db: Db, scope: BundleScope): Promise<ContentBundle> {
  const cache = await getContentCache(db);
  const allowedPacks = new Set(scope.settings?.allowedPacks ?? [...cache.packs.keys()].filter((k) => cache.packs.get(k)?.visibility === 'global'));
  // Личные homebrew-пакеты пользователя и пакет кампании доступны всегда.
  for (const [k, p] of cache.packs) {
    if (p.ownerUserId === scope.userId && p.visibility === 'private') allowedPacks.add(k);
    if (scope.campaignId && p.campaignId === scope.campaignId) allowedPacks.add(k);
  }
  const sources = scope.settings?.allowedSources;
  const entities: ContentEntity[] = [];
  const hidden: string[] = [];
  for (const e of cache.entities) {
    if (!allowedPacks.has(e.packKey)) continue;
    const own = e.authorId === scope.userId;
    if (e.status !== 'approved' && !own) continue;
    const { packKey: _p, status: _s, authorId: _a, ...entity } = e;
    entities.push(entity);
    const sourceAllowed =
      !sources || sources === 'all' || !e.sourceBook || sources.includes(e.sourceBook) || e.packKey.startsWith('hb-');
    if (e.removed || !sourceAllowed || e.status === 'rejected') hidden.push(e.key);
  }
  const packs = [...allowedPacks]
    .filter((k) => cache.packs.has(k))
    .sort()
    .map((k) => ({ key: k, name: cache.packs.get(k)!.name, version: cache.packs.get(k)!.version }));
  const h = createHash('sha256');
  h.update(String(cache.generation));
  h.update(JSON.stringify(packs));
  h.update(JSON.stringify(sources ?? 'all'));
  h.update(scope.userId);
  const etag = `"${h.digest('hex').slice(0, 32)}"`;
  return { etag, entities, hidden, packs };
}

/** ContentIndex на сервере (для compute при сохранении персонажа). */
const indexCache = new Map<string, { gen: number; index: ContentIndex }>();

export async function serverContentIndex(db: Db, scope: BundleScope): Promise<ContentIndex> {
  const cache = await getContentCache(db);
  const k = `${scope.userId}|${scope.campaignId ?? ''}|${JSON.stringify(scope.settings)}`;
  const hit = indexCache.get(k);
  if (hit && hit.gen === cache.generation) return hit.index;
  const bundle = await buildBundle(db, scope);
  const index = createContentIndex(bundle.entities);
  if (indexCache.size > 200) indexCache.clear();
  indexCache.set(k, { gen: cache.generation, index });
  return index;
}

export async function packVisibility(db: Db, key: string) {
  const [p] = await db.select().from(contentPacks).where(eq(contentPacks.key, key));
  return p;
}
