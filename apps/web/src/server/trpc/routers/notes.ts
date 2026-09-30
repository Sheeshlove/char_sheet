import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { authedProcedure, router } from '../init';
import { campaignMembers, campaigns, characters, contentEntities, noteLinks, notes, noteShares, noteVersions, users } from '../../db/schema';
import { badRequest, forbidden, notFound } from '../errors';
import {
  assertCharacterForNote,
  filterSql,
  headline,
  insertNote,
  loadEditable,
  loadNote,
  loadViewable,
  markShareRead,
  notDeleted,
  permissionsOf,
  requireScope,
  scopeSql,
  tagsForNotes,
  tsQuery,
  updateNote,
  visibleNoteSql,
} from '../../services/notes';
import { noteAccessInput } from '../../auth/guards';
import { canTrashNote } from '../../auth/access';
import {
  EMPTY_DOC,
  noteBodySchema,
  noteDateSchema,
  noteFilterSchema,
  noteTypeSchema,
  noteVisibilitySchema,
  readNoteFields,
  type DocNode,
  type NoteType,
} from '@/lib/notes/schema';

const noteId = z.object({ noteId: z.uuid() });
const scope = z.object({ campaignId: z.uuid().nullable() });
const title = z.string().trim().max(200);
const sessionNo = z.number().int().min(0).max(100_000).nullable();

const LIST_COLUMNS = {
  id: notes.id,
  title: notes.title,
  type: notes.type,
  visibility: notes.visibility,
  fields: notes.fields,
  sessionNo: notes.sessionNo,
  gameDate: notes.gameDate,
  realDate: notes.realDate,
  pinned: notes.pinned,
  isHandout: notes.isHandout,
  characterId: notes.characterId,
  authorId: notes.authorId,
  authorName: users.displayName,
  campaignId: notes.campaignId,
  createdAt: notes.createdAt,
  updatedAt: notes.updatedAt,
  deletedAt: notes.deletedAt,
};

function orderFor(sort: 'updated' | 'created' | 'title' | 'session'): SQL[] {
  switch (sort) {
    case 'created':
      return [desc(notes.createdAt)];
    case 'title':
      return [asc(sql`lower(${notes.title})`), desc(notes.updatedAt)];
    case 'session':
      return [sql`${notes.sessionNo} desc nulls last`, desc(notes.updatedAt)];
    default:
      return [desc(notes.updatedAt)];
  }
}

/** Названия целей ссылок (заметки — только видимые зрителю). */
async function linkLabels(
  db: Parameters<typeof tagsForNotes>[0],
  userId: string,
  links: { targetType: 'note' | 'character' | 'content'; targetId: string }[],
) {
  const ids = (t: string) => links.filter((l) => l.targetType === t).map((l) => l.targetId);
  const uuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
  const [n, c, e] = await Promise.all([
    ids('note').filter(uuid).length
      ? db
          .select({ id: notes.id, label: notes.title, type: notes.type })
          .from(notes)
          .where(and(inArray(notes.id, ids('note').filter(uuid)), isNull(notes.deletedAt), visibleNoteSql(userId)))
      : [],
    ids('character').filter(uuid).length
      ? db.select({ id: characters.id, label: characters.name }).from(characters).where(inArray(characters.id, ids('character').filter(uuid)))
      : [],
    ids('content').length
      ? db.select({ id: contentEntities.key, label: contentEntities.nameRu, kind: contentEntities.kind }).from(contentEntities).where(inArray(contentEntities.key, ids('content')))
      : [],
  ]);
  const byKey = new Map<string, { label: string; kind?: string }>();
  for (const r of n) byKey.set(`note:${r.id}`, { label: r.label, kind: r.type });
  for (const r of c) byKey.set(`character:${r.id}`, { label: r.label });
  for (const r of e) byKey.set(`content:${r.id}`, { label: r.label, kind: r.kind });
  return links
    .map((l) => ({ ...l, ...byKey.get(`${l.targetType}:${l.targetId}`) }))
    .filter((l): l is typeof l & { label: string } => typeof l.label === 'string');
}

const patchSchema = z.strictObject({
  title: title.optional(),
  body: noteBodySchema.optional(),
  type: noteTypeSchema.optional(),
  fields: z.record(z.string(), z.unknown()).optional(),
  visibility: noteVisibilitySchema.optional(),
  sessionNo: sessionNo.optional(),
  gameDate: z.string().trim().max(100).nullable().optional(),
  realDate: noteDateSchema.nullable().optional(),
  pinned: z.boolean().optional(),
  characterId: z.uuid().nullable().optional(),
});

export const notesRouter = router({
  /** Список с фильтром (§11.3). Гард: участник кампании (или свои личные) + видимость каждой заметки. */
  list: authedProcedure
    .input(
      scope.extend({
        filter: noteFilterSchema.default(noteFilterSchema.parse({})),
        trashed: z.boolean().default(false),
        cursor: z.number().int().min(0).nullish(),
        limit: z.number().int().min(1).max(200).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      await requireScope(ctx, input.campaignId);
      const offset = input.cursor ?? 0;
      const where = [
        scopeSql(ctx.user.id, input.campaignId),
        notDeleted(input.trashed),
        // Корзина — только свои заметки: восстановить или удалить может лишь автор.
        input.trashed ? eq(notes.authorId, ctx.user.id) : visibleNoteSql(ctx.user.id),
        ...filterSql(input.filter),
      ];
      const q = input.filter.text;
      const rows = await ctx.db
        .select({ ...LIST_COLUMNS, snippet: q ? headline(q) : sql<string>`''` })
        .from(notes)
        .innerJoin(users, eq(users.id, notes.authorId))
        .where(and(...where))
        .orderBy(...orderFor(input.filter.sort))
        .limit(input.limit + 1)
        .offset(offset);
      const page = rows.slice(0, input.limit);
      const tagMap = await tagsForNotes(ctx.db, page.map((r) => r.id));
      return {
        items: page.map((r) => ({
          ...r,
          fields: readNoteFields(r.type, r.fields),
          snippet: q && r.snippet.includes('\u0001') ? r.snippet : '',
          tags: tagMap.get(r.id) ?? [],
        })),
        nextCursor: rows.length > input.limit ? offset + input.limit : null,
      };
    }),

  /** Заметка целиком. Гард: `canViewNote`. */
  get: authedProcedure.input(noteId).query(async ({ ctx, input }) => {
    const { row, access } = await loadViewable(ctx, input.noteId);
    const [author] = await ctx.db.select({ name: users.displayName }).from(users).where(eq(users.id, row.authorId));
    const [character] = row.characterId
      ? await ctx.db.select({ id: characters.id, name: characters.name }).from(characters).where(eq(characters.id, row.characterId))
      : [];
    const [campaign] = row.campaignId
      ? await ctx.db.select({ id: campaigns.id, name: campaigns.name }).from(campaigns).where(eq(campaigns.id, row.campaignId))
      : [];
    const perms = permissionsOf(access);
    const shares = perms.canShare
      ? await ctx.db
          .select({ userId: noteShares.userId, readAt: noteShares.readAt, name: users.displayName })
          .from(noteShares)
          .innerJoin(users, eq(users.id, noteShares.userId))
          .where(eq(noteShares.noteId, row.id))
      : [];
    const links = await ctx.db
      .select({ targetType: noteLinks.targetType, targetId: noteLinks.targetId })
      .from(noteLinks)
      .where(eq(noteLinks.fromNoteId, row.id));
    return {
      id: row.id,
      title: row.title,
      type: row.type,
      body: row.body as DocNode,
      fields: readNoteFields(row.type, row.fields),
      visibility: row.visibility,
      isHandout: row.isHandout,
      sessionNo: row.sessionNo,
      gameDate: row.gameDate,
      realDate: row.realDate,
      pinned: row.pinned,
      campaign: campaign ?? null,
      viewerRole: access.viewerRole,
      character: character ?? null,
      authorId: row.authorId,
      authorName: author?.name ?? '',
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      tags: (await tagsForNotes(ctx.db, [row.id])).get(row.id) ?? [],
      links: await linkLabels(ctx.db, ctx.user.id, links),
      shares,
      isShareRecipient: access.isShareRecipient,
      ...perms,
    };
  }),

  /** Подсказка `[[`: заголовки заметок той же области. Гард: участник кампании + видимость. */
  lookup: authedProcedure
    .input(scope.extend({ q: z.string().trim().max(100).default(''), limit: z.number().int().min(1).max(20).default(8) }))
    .query(async ({ ctx, input }) => {
      await requireScope(ctx, input.campaignId);
      const like = `%${input.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      return ctx.db
        .select({ id: notes.id, title: notes.title, type: notes.type })
        .from(notes)
        .where(and(scopeSql(ctx.user.id, input.campaignId), isNull(notes.deletedAt), visibleNoteSql(ctx.user.id), input.q ? ilike(notes.title, like) : undefined))
        .orderBy(desc(notes.updatedAt))
        .limit(input.limit);
    }),

  /** Создать. Гард: участник кампании (личные — сам пользователь); персонаж — видимый зрителю. */
  create: authedProcedure
    .input(
      scope.extend({
        characterId: z.uuid().nullable().default(null),
        type: noteTypeSchema.default('general'),
        title: title.default(''),
        body: noteBodySchema.optional(),
        fields: z.record(z.string(), z.unknown()).optional(),
        visibility: noteVisibilitySchema.default('private'),
        sessionNo: sessionNo.optional(),
        gameDate: z.string().trim().max(100).nullable().optional(),
        realDate: noteDateSchema.nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireScope(ctx, input.campaignId);
      if (input.characterId) await assertCharacterForNote(ctx, input.characterId, input.campaignId);
      const row = await ctx.db.transaction((tx) =>
        insertNote(tx, {
          authorId: ctx.user.id,
          campaignId: input.campaignId,
          characterId: input.characterId,
          type: input.type,
          title: input.title,
          body: input.body ?? EMPTY_DOC,
          fields: input.fields,
          visibility: input.visibility,
          sessionNo: input.sessionNo,
          gameDate: input.gameDate,
          realDate: input.realDate,
        }),
      );
      return { id: row.id, updatedAt: row.updatedAt };
    }),

  /** Сохранить. Гард: `canEditNote`; видимость меняет только автор; `expectedUpdatedAt`. */
  update: authedProcedure
    .input(noteId.extend({ expectedUpdatedAt: z.date(), patch: patchSchema }))
    .mutation(async ({ ctx, input }) => {
      const { row } = await loadEditable(ctx, input.noteId);
      const { patch } = input;
      if (patch.visibility !== undefined && patch.visibility !== row.visibility && row.authorId !== ctx.user.id) throw forbidden();
      if (patch.characterId) await assertCharacterForNote(ctx, patch.characterId, row.campaignId);
      const updated = await updateNote(ctx.db, ctx.user.id, row.id, input.expectedUpdatedAt, patch);
      return { updatedAt: updated.updatedAt };
    }),

  /** В корзину. Гард: `canTrashNote` (автор). */
  trash: authedProcedure.input(noteId).mutation(async ({ ctx, input }) => {
    const { row, access } = await loadViewable(ctx, input.noteId);
    if (!canTrashNote(access)) throw forbidden();
    await ctx.db.update(notes).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(notes.id, row.id));
    return { ok: true as const };
  }),

  /** Восстановить из корзины. Гард: автор. */
  restore: authedProcedure.input(noteId).mutation(async ({ ctx, input }) => {
    const row = await loadNote(ctx, input.noteId, { trashed: true });
    if (!canTrashNote(await noteAccessInput(ctx, row))) throw notFound();
    await ctx.db.update(notes).set({ deletedAt: null, updatedAt: new Date() }).where(eq(notes.id, row.id));
    return { ok: true as const };
  }),

  /** Удалить окончательно (только из корзины). Гард: автор. */
  purge: authedProcedure.input(noteId).mutation(async ({ ctx, input }) => {
    const row = await loadNote(ctx, input.noteId, { trashed: true });
    if (!canTrashNote(await noteAccessInput(ctx, row))) throw notFound();
    if (!row.deletedAt) throw badRequest('note_not_trashed');
    await ctx.db.delete(notes).where(eq(notes.id, row.id));
    return { ok: true as const };
  }),

  versions: router({
    /** Версии заметки. Гард: `canViewNote`. */
    list: authedProcedure.input(noteId).query(async ({ ctx, input }) => {
      await loadViewable(ctx, input.noteId);
      return ctx.db
        .select({ id: noteVersions.id, title: noteVersions.title, createdAt: noteVersions.createdAt, authorName: users.displayName })
        .from(noteVersions)
        .leftJoin(users, eq(users.id, noteVersions.authorId))
        .where(eq(noteVersions.noteId, input.noteId))
        .orderBy(desc(noteVersions.createdAt))
        .limit(100);
    }),
    /** Содержимое версии. Гард: `canViewNote` заметки версии. */
    get: authedProcedure.input(z.object({ versionId: z.uuid() })).query(async ({ ctx, input }) => {
      const [v] = await ctx.db.select().from(noteVersions).where(eq(noteVersions.id, input.versionId));
      if (!v) throw notFound();
      await loadViewable(ctx, v.noteId);
      return { id: v.id, noteId: v.noteId, title: v.title, body: v.body as DocNode, createdAt: v.createdAt };
    }),
    /** Восстановить версию (текущее содержимое сохраняется версией). Гард: `canEditNote`. */
    restore: authedProcedure
      .input(noteId.extend({ versionId: z.uuid(), expectedUpdatedAt: z.date() }))
      .mutation(async ({ ctx, input }) => {
        const { row } = await loadEditable(ctx, input.noteId);
        const [v] = await ctx.db
          .select()
          .from(noteVersions)
          .where(and(eq(noteVersions.id, input.versionId), eq(noteVersions.noteId, row.id)));
        if (!v) throw notFound();
        const updated = await updateNote(
          ctx.db,
          ctx.user.id,
          row.id,
          input.expectedUpdatedAt,
          { title: v.title, body: noteBodySchema.parse(v.body) },
          { forceVersion: true },
        );
        return { updatedAt: updated.updatedAt };
      }),
  }),

  /** Раздаточный материал: адресаты — участники кампании (§11.6). Гард: `canShareNote`. */
  share: authedProcedure
    .input(noteId.extend({ userIds: z.array(z.uuid()).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const { row, access } = await loadViewable(ctx, input.noteId);
      if (!permissionsOf(access).canShare) throw forbidden();
      const wanted = [...new Set(input.userIds)].filter((u) => u !== row.authorId);
      if (wanted.length) {
        const members = await ctx.db
          .select({ userId: campaignMembers.userId })
          .from(campaignMembers)
          .where(and(eq(campaignMembers.campaignId, row.campaignId!), inArray(campaignMembers.userId, wanted)));
        if (members.length !== wanted.length) throw badRequest('share_not_member');
      }
      await ctx.db.transaction(async (tx) => {
        const current = await tx.select({ userId: noteShares.userId }).from(noteShares).where(eq(noteShares.noteId, row.id));
        const drop = current.map((c) => c.userId).filter((u) => !wanted.includes(u));
        if (drop.length) await tx.delete(noteShares).where(and(eq(noteShares.noteId, row.id), inArray(noteShares.userId, drop)));
        const add = wanted.filter((u) => !current.some((c) => c.userId === u));
        if (add.length) await tx.insert(noteShares).values(add.map((userId) => ({ noteId: row.id, userId })));
        await tx.update(notes).set({ isHandout: wanted.length > 0 }).where(eq(notes.id, row.id));
      });
      return { ok: true as const, recipients: wanted.length };
    }),

  /** Отметить раздаточный материал прочитанным. Гард: адресат. */
  markRead: authedProcedure.input(noteId).mutation(async ({ ctx, input }) => {
    const { access } = await loadViewable(ctx, input.noteId);
    if (!access.isShareRecipient) throw forbidden();
    await markShareRead(ctx.db, input.noteId, ctx.user.id);
    return { ok: true as const };
  }),

  /** Раздаточные материалы, адресованные мне. Гард: `requireUser` (только свои). */
  handouts: authedProcedure.input(z.object({ campaignId: z.uuid().nullish() })).query(async ({ ctx, input }) => {
    const rows = await ctx.db
      .select({
        id: notes.id,
        title: notes.title,
        type: notes.type,
        campaignId: notes.campaignId,
        campaignName: campaigns.name,
        authorName: users.displayName,
        sharedAt: noteShares.createdAt,
        readAt: noteShares.readAt,
      })
      .from(noteShares)
      .innerJoin(notes, eq(notes.id, noteShares.noteId))
      .innerJoin(users, eq(users.id, notes.authorId))
      .leftJoin(campaigns, eq(campaigns.id, notes.campaignId))
      .where(and(eq(noteShares.userId, ctx.user.id), isNull(notes.deletedAt), input.campaignId ? eq(notes.campaignId, input.campaignId) : undefined))
      .orderBy(desc(noteShares.createdAt))
      .limit(100);
    return { items: rows, unread: rows.filter((r) => !r.readAt).length };
  }),

  /** Обратные ссылки (WikiLink, Mention, поля) — только видимые зрителю заметки. Гард: `canViewNote`. */
  backlinks: authedProcedure.input(noteId).query(async ({ ctx, input }) => {
    await loadViewable(ctx, input.noteId);
    return ctx.db
      .select({ id: notes.id, title: notes.title, type: notes.type, context: noteLinks.context, updatedAt: notes.updatedAt })
      .from(noteLinks)
      .innerJoin(notes, eq(notes.id, noteLinks.fromNoteId))
      .where(and(eq(noteLinks.targetType, 'note'), eq(noteLinks.targetId, input.noteId), isNull(notes.deletedAt), visibleNoteSql(ctx.user.id)))
      .orderBy(desc(notes.updatedAt))
      .limit(200);
  }),

  /** Заметки, ссылающиеся на персонажа или сущность контента. Гард: видимость каждой заметки. */
  mentions: authedProcedure
    .input(z.object({ targetType: z.enum(['character', 'content']), targetId: z.string().max(200) }))
    .query(async ({ ctx, input }) =>
      ctx.db
        .select({ id: notes.id, title: notes.title, type: notes.type, campaignId: notes.campaignId, context: noteLinks.context })
        .from(noteLinks)
        .innerJoin(notes, eq(notes.id, noteLinks.fromNoteId))
        .where(and(eq(noteLinks.targetType, input.targetType), eq(noteLinks.targetId, input.targetId), isNull(notes.deletedAt), visibleNoteSql(ctx.user.id)))
        .orderBy(desc(notes.updatedAt))
        .limit(100),
    ),

  /** Полнотекстовый поиск со сниппетами. Без `campaignId` — по всем видимым заметкам. Гард: видимость. */
  search: authedProcedure
    .input(z.object({ campaignId: z.uuid().nullish(), q: z.string().trim().min(1).max(200), limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      if (input.campaignId) await requireScope(ctx, input.campaignId);
      const like = `%${input.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const rows = await ctx.db
        .select({
          id: notes.id,
          title: notes.title,
          type: notes.type,
          campaignId: notes.campaignId,
          campaignName: campaigns.name,
          snippet: headline(input.q),
          rank: sql<number>`ts_rank(${notes.search}, ${tsQuery(input.q)})`,
        })
        .from(notes)
        .leftJoin(campaigns, eq(campaigns.id, notes.campaignId))
        .where(
          and(
            isNull(notes.deletedAt),
            visibleNoteSql(ctx.user.id),
            input.campaignId ? eq(notes.campaignId, input.campaignId) : undefined,
            sql`(${notes.search} @@ ${tsQuery(input.q)} or ${notes.title} ilike ${like})`,
          ),
        )
        .orderBy(sql`ts_rank(${notes.search}, ${tsQuery(input.q)}) desc`, desc(notes.updatedAt))
        .limit(input.limit);
      return rows.map((r) => ({ ...r, snippet: r.snippet.includes('\u0001') ? r.snippet : '' }));
    }),

  /** Граф связей: видимые заметки кампании и ссылки между ними (§11.4). Гард: участник + видимость. */
  graph: authedProcedure.input(z.object({ campaignId: z.uuid() })).query(async ({ ctx, input }) => {
    await requireScope(ctx, input.campaignId);
    const nodes = await ctx.db
      .select({ id: notes.id, title: notes.title, type: notes.type })
      .from(notes)
      .where(and(eq(notes.campaignId, input.campaignId), isNull(notes.deletedAt), visibleNoteSql(ctx.user.id)));
    const ids = new Set(nodes.map((n) => n.id));
    const edges = nodes.length
      ? (
          await ctx.db
            .select({ from: noteLinks.fromNoteId, to: noteLinks.targetId })
            .from(noteLinks)
            .where(and(eq(noteLinks.targetType, 'note'), inArray(noteLinks.fromNoteId, [...ids])))
        ).filter((e) => ids.has(e.to))
      : [];
    return { nodes, edges };
  }),

  /** Хронология: видимые заметки с номером сессии (§11.4). Гард: участник + видимость. */
  timeline: authedProcedure.input(z.object({ campaignId: z.uuid() })).query(async ({ ctx, input }) => {
    await requireScope(ctx, input.campaignId);
    return ctx.db
      .select({
        id: notes.id,
        title: notes.title,
        type: notes.type,
        sessionNo: notes.sessionNo,
        gameDate: notes.gameDate,
        realDate: notes.realDate,
        updatedAt: notes.updatedAt,
      })
      .from(notes)
      .where(and(eq(notes.campaignId, input.campaignId), isNull(notes.deletedAt), isNotNull(notes.sessionNo), visibleNoteSql(ctx.user.id)))
      .orderBy(asc(notes.sessionNo), sql`${notes.type} <> 'session'`, asc(notes.createdAt))
      .limit(1000);
  }),

  /** Счётчики по типам для левой панели. Гард: участник + видимость. */
  counts: authedProcedure.input(scope).query(async ({ ctx, input }) => {
    await requireScope(ctx, input.campaignId);
    const rows = await ctx.db
      .select({ type: notes.type, n: count() })
      .from(notes)
      .where(and(scopeSql(ctx.user.id, input.campaignId), isNull(notes.deletedAt), visibleNoteSql(ctx.user.id)))
      .groupBy(notes.type);
    return Object.fromEntries(rows.map((r) => [r.type, r.n])) as Partial<Record<NoteType, number>>;
  }),

  /** Последние заметки на главной: личные и из кампаний. Гард: видимость. */
  recent: authedProcedure.input(z.object({ limit: z.number().int().min(1).max(20).default(6) })).query(async ({ ctx, input }) =>
    ctx.db
      .select({ id: notes.id, title: notes.title, type: notes.type, campaignId: notes.campaignId, campaignName: campaigns.name, updatedAt: notes.updatedAt })
      .from(notes)
      .leftJoin(campaigns, eq(campaigns.id, notes.campaignId))
      .where(and(isNull(notes.deletedAt), visibleNoteSql(ctx.user.id), sql`(${notes.campaignId} is null or ${campaigns.archivedAt} is null)`))
      .orderBy(desc(notes.updatedAt))
      .limit(input.limit),
  ),
});

