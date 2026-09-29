import { and, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import { readAllPacks, type LoadedPack } from '@ps/content-data';
import type { Db } from '../db/client';
import { contentEntities, contentPacks } from '../db/schema';
import { invalidateContentCache } from './cache';

export type LoadReport = { pack: string; status: 'loaded' | 'unchanged'; entities: number; removed: number }[];

const BATCH = 200;

/**
 * `content:load` (SPEC §7.7): upsert пакетов из `@ps/content-data` по ключу. Загружаются только
 * пакеты, чья версия (sha256) изменилась. Пропавшие сущности получают `removed_at`.
 */
export async function loadContentPacks(db: Db, opts: { force?: boolean; packs?: LoadedPack[] } = {}): Promise<LoadReport> {
  const packs = opts.packs ?? readAllPacks();
  const report: LoadReport = [];
  for (const { manifest, entities } of packs) {
    const [existing] = await db.select().from(contentPacks).where(eq(contentPacks.key, manifest.key));
    if (!opts.force && existing?.version === manifest.version) {
      report.push({ pack: manifest.key, status: 'unchanged', entities: entities.length, removed: 0 });
      continue;
    }
    let removed = 0;
    await db.transaction(async (tx) => {
      await tx
        .insert(contentPacks)
        .values({
          key: manifest.key,
          name: manifest.name,
          sourceType: manifest.sourceType,
          visibility: 'global',
          version: manifest.version,
          importedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: contentPacks.key,
          set: { name: manifest.name, version: manifest.version, importedAt: new Date() },
        });
      for (let i = 0; i < entities.length; i += BATCH) {
        const rows = entities.slice(i, i + BATCH).map((e) => ({
          key: e.key,
          packKey: manifest.key,
          kind: e.kind,
          slug: e.slug,
          nameRu: e.nameRu,
          nameEn: e.nameEn ?? null,
          sourceBook: e.sourceBook ?? null,
          sourceUrl: e.sourceUrl ?? null,
          data: e.data as object,
          textMd: e.textMd ?? '',
          effectsStatus: e.effectsStatus,
          status: 'approved' as const,
          removedAt: null,
        }));
        await tx
          .insert(contentEntities)
          .values(rows)
          .onConflictDoUpdate({
            target: contentEntities.key,
            set: {
              packKey: sql`excluded.pack_key`,
              kind: sql`excluded.kind`,
              slug: sql`excluded.slug`,
              nameRu: sql`excluded.name_ru`,
              nameEn: sql`excluded.name_en`,
              sourceBook: sql`excluded.source_book`,
              sourceUrl: sql`excluded.source_url`,
              data: sql`excluded.data`,
              textMd: sql`excluded.text_md`,
              effectsStatus: sql`excluded.effects_status`,
              removedAt: sql`null`,
              updatedAt: new Date(),
            },
          });
      }
      const keys = entities.map((e) => e.key);
      const gone = await tx
        .update(contentEntities)
        .set({ removedAt: new Date() })
        .where(
          and(
            eq(contentEntities.packKey, manifest.key),
            isNull(contentEntities.removedAt),
            keys.length ? notInArray(contentEntities.key, keys) : sql`true`,
          ),
        )
        .returning({ key: contentEntities.key });
      removed = gone.length;
    });
    report.push({ pack: manifest.key, status: 'loaded', entities: entities.length, removed });
  }
  invalidateContentCache();
  return report;
}

export async function packKeysInDb(db: Db, keys: string[]) {
  if (!keys.length) return [];
  return db.select({ key: contentPacks.key }).from(contentPacks).where(inArray(contentPacks.key, keys));
}
