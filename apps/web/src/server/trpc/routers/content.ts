import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { CONTENT_KINDS } from '@ps/content-schema';
import { adminProcedure, authedProcedure, router } from '../init';
import { contentEntities, contentPacks } from '../../db/schema';
import { notFound } from '../errors';
import { loadContentPacks } from '../../content/load';

const kindSchema = z.enum(CONTENT_KINDS);

/**
 * Видимость контента в справочнике: одобренные сущности глобальных пакетов — всем вошедшим;
 * homebrew (SPEC §14) — одобренные сущности своего личного пакета и пакетов своих кампаний;
 * свои черновики — автору.
 */
function visibleTo(userId: string): SQL {
  return or(
    and(
      eq(contentEntities.status, 'approved'),
      inArray(
        contentEntities.packKey,
        sql`(select p.key from content_packs p where p.visibility = 'global'
              or (p.visibility = 'private' and p.owner_user_id = ${userId})
              or (p.visibility = 'campaign' and exists (
                select 1 from campaign_members m where m.campaign_id = p.campaign_id and m.user_id = ${userId})))`,
      ),
    ),
    eq(contentEntities.authorId, userId),
  )!;
}

const listInput = z.object({
  kind: kindSchema.optional(),
  pack: z.string().max(80).optional(),
  source: z.string().max(80).optional(),
  q: z.string().trim().max(120).optional(),
  cursor: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(200).default(50),
});

export const contentRouter = router({
  /** Список сущностей с фильтрами и полнотекстовым поиском (`russian`). */
  list: authedProcedure.input(listInput).query(async ({ ctx, input }) => {
    const conds: SQL[] = [visibleTo(ctx.user.id), isNull(contentEntities.removedAt)];
    if (input.kind) conds.push(eq(contentEntities.kind, input.kind));
    if (input.pack) conds.push(eq(contentEntities.packKey, input.pack));
    if (input.source) conds.push(eq(contentEntities.sourceBook, input.source));
    let rank: SQL | undefined;
    if (input.q) {
      const q = input.q;
      const like = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
      conds.push(
        or(
          sql`${contentEntities.search} @@ websearch_to_tsquery('russian', ${q})`,
          ilike(contentEntities.nameRu, like),
          ilike(contentEntities.nameEn, like),
        )!,
      );
      rank = sql`(case when lower(${contentEntities.nameRu}) = lower(${q}) then 3 when ${contentEntities.nameRu} ilike ${`${q}%`} then 2 when ${contentEntities.nameRu} ilike ${like} then 1 else 0 end) + ts_rank(${contentEntities.search}, websearch_to_tsquery('russian', ${q}))`;
    }
    const where = and(...conds);
    const rows = await ctx.db
      .select({
        key: contentEntities.key,
        kind: contentEntities.kind,
        packKey: contentEntities.packKey,
        slug: contentEntities.slug,
        nameRu: contentEntities.nameRu,
        nameEn: contentEntities.nameEn,
        sourceBook: contentEntities.sourceBook,
        effectsStatus: contentEntities.effectsStatus,
        data: contentEntities.data,
      })
      .from(contentEntities)
      .where(where)
      .orderBy(...(rank ? [desc(rank)] : []), asc(contentEntities.nameRu))
      .limit(input.limit + 1)
      .offset(input.cursor);
    const hasMore = rows.length > input.limit;
    const items = rows.slice(0, input.limit).map((r) => ({ ...r, summary: summarizeData(r.kind, r.data) }));
    return { items: items.map(({ data: _d, ...rest }) => rest), nextCursor: hasMore ? input.cursor + input.limit : null };
  }),

  /** Сущность целиком, с `text_md`. */
  get: authedProcedure.input(z.object({ key: z.string().max(200) })).query(async ({ ctx, input }) => {
    const [row] = await ctx.db
      .select()
      .from(contentEntities)
      .where(and(eq(contentEntities.key, input.key), visibleTo(ctx.user.id)));
    if (!row) throw notFound();
    const [pack] = await ctx.db.select({ name: contentPacks.name }).from(contentPacks).where(eq(contentPacks.key, row.packKey));
    return { ...row, packName: pack?.name ?? row.packKey, search: undefined };
  }),

  /** Быстрый поиск для упоминаний и выбора предметов. */
  search: authedProcedure
    .input(z.object({ q: z.string().trim().min(1).max(120), kinds: z.array(kindSchema).optional(), limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      const like = `%${input.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
      const conds: SQL[] = [
        visibleTo(ctx.user.id),
        isNull(contentEntities.removedAt),
        or(
          ilike(contentEntities.nameRu, like),
          ilike(contentEntities.nameEn, like),
          sql`${contentEntities.search} @@ websearch_to_tsquery('russian', ${input.q})`,
        )!,
      ];
      if (input.kinds?.length) conds.push(inArray(contentEntities.kind, input.kinds));
      return ctx.db
        .select({ key: contentEntities.key, kind: contentEntities.kind, nameRu: contentEntities.nameRu, sourceBook: contentEntities.sourceBook })
        .from(contentEntities)
        .where(and(...conds))
        .orderBy(desc(sql`${contentEntities.nameRu} ilike ${`${input.q}%`}`), asc(contentEntities.nameRu))
        .limit(input.limit);
    }),

  /** Фильтры справочника: пакеты и книги-источники. */
  facets: authedProcedure.query(async ({ ctx }) => {
    const packs = await ctx.db
      .select({ key: contentPacks.key, name: contentPacks.name })
      .from(contentPacks)
      .where(eq(contentPacks.visibility, 'global'))
      .orderBy(asc(contentPacks.key));
    const sources = await ctx.db
      .selectDistinct({ source: contentEntities.sourceBook })
      .from(contentEntities)
      .where(and(visibleTo(ctx.user.id), isNull(contentEntities.removedAt)))
      .orderBy(asc(contentEntities.sourceBook));
    return { packs, sources: sources.map((s) => s.source).filter((s): s is string => !!s) };
  }),

  /** Пакеты для настроек кампании. */
  packs: authedProcedure.query(async ({ ctx }) =>
    ctx.db
      .select({ key: contentPacks.key, name: contentPacks.name, sourceType: contentPacks.sourceType })
      .from(contentPacks)
      .where(eq(contentPacks.visibility, 'global'))
      .orderBy(asc(contentPacks.key)),
  ),
});

export const adminPacksRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    const counts = ctx.db
      .select({ packKey: contentEntities.packKey, n: count().as('n') })
      .from(contentEntities)
      .where(isNull(contentEntities.removedAt))
      .groupBy(contentEntities.packKey)
      .as('c');
    const rows = await ctx.db
      .select({
        key: contentPacks.key,
        name: contentPacks.name,
        sourceType: contentPacks.sourceType,
        visibility: contentPacks.visibility,
        version: contentPacks.version,
        importedAt: contentPacks.importedAt,
        entities: counts.n,
      })
      .from(contentPacks)
      .leftJoin(counts, eq(counts.packKey, contentPacks.key))
      .orderBy(asc(contentPacks.key));
    return rows.map((r) => ({ ...r, entities: Number(r.entities ?? 0) }));
  }),
  reload: adminProcedure.input(z.object({ force: z.boolean().default(false) })).mutation(async ({ ctx, input }) => {
    return loadContentPacks(ctx.db, { force: input.force });
  }),
});

/** Краткая сводка сущности для строки списка (цена, вес, круг и т. п.). */
function summarizeData(kind: string, data: unknown): Record<string, string | number | boolean> {
  const d = data as Record<string, unknown>;
  switch (kind) {
    case 'weapon': {
      const w = d as { category: string; damage: { dice: string; type: string }; costCp: number; weightLb: number };
      return { category: w.category, damage: `${w.damage.dice}`, damageType: w.damage.type, costCp: w.costCp, weightLb: w.weightLb };
    }
    case 'armor': {
      const a = d as { category: string; baseAc: number; costCp: number; weightLb: number };
      return { category: a.category, baseAc: a.baseAc, costCp: a.costCp, weightLb: a.weightLb };
    }
    case 'gear':
    case 'tool': {
      const g = d as { kind: string; costCp: number; weightLb: number };
      return { gearKind: g.kind, costCp: g.costCp, weightLb: g.weightLb };
    }
    case 'spell': {
      const s = d as { level: number; school: string; ritual: boolean; duration: { concentration: boolean } };
      return { level: s.level, school: s.school, ritual: s.ritual, concentration: s.duration.concentration };
    }
    case 'item': {
      const m = d as { rarity: string; itemType: string; attunement: unknown };
      return { rarity: m.rarity, itemType: m.itemType, attunement: m.attunement !== false };
    }
    case 'class': {
      const c = d as { hitDie: number };
      return { hitDie: c.hitDie };
    }
    default:
      return {};
  }
}
