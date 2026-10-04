import { and, desc, eq, inArray, isNotNull, isNull, lt, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../db/client';
import { characters, noteLinks, notes, noteShares, noteTags, noteVersions, tags } from '../db/schema';
import type { Context } from '../trpc/context';
import { canViewCharacter, getCampaignRole, noteAccessInput } from '../auth/guards';
import { canEditNote, canShareNote, canTrashNote, canViewNote, type NoteAccessInput } from '../auth/access';
import { badRequest, conflict, forbidden, notFound } from '../trpc/errors';
import { docText, noteLinks as extractLinks } from '@/lib/notes/doc';
import {
  parseNoteFields,
  readNoteFields,
  type DocNode,
  type NoteFilter,
  type NoteType,
  type NoteVisibilityValue,
} from '@/lib/notes/schema';

/** Заметки (SPEC §11): видимость, сохранение со ссылками и версиями, корзина. */

export type NoteRow = typeof notes.$inferSelect;
type Ctx = Pick<Context, 'db' | 'user'>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Версия — не чаще раза в 5 минут на заметку (§4.5). */
export const VERSION_INTERVAL_MS = 5 * 60 * 1000;
/** Корзина очищается через 30 дней (§11.5). */
export const TRASH_DAYS = 30;

/**
 * SQL-условие «зритель видит заметку» — то же, что `canViewNote` (§5.3): автор, адресат
 * раздаточного материала, `party` — участник кампании, `gm` — мастер или со-мастер.
 */
export function visibleNoteSql(userId: string): SQL {
  return sql`(
    ${notes.authorId} = ${userId}
    or exists (select 1 from note_shares s where s.note_id = ${notes.id} and s.user_id = ${userId})
    or (${notes.visibility} = 'party' and exists (
      select 1 from campaign_members m where m.campaign_id = ${notes.campaignId} and m.user_id = ${userId}))
    or (${notes.visibility} = 'gm' and exists (
      select 1 from campaign_members m where m.campaign_id = ${notes.campaignId} and m.user_id = ${userId} and m.role in ('gm', 'co_gm')))
  )`;
}

/** Область списка: заметки кампании или личные заметки пользователя вне кампаний. */
export function scopeSql(userId: string, campaignId: string | null): SQL {
  return campaignId ? eq(notes.campaignId, campaignId) : and(isNull(notes.campaignId), eq(notes.authorId, userId))!;
}

export async function requireScope(ctx: Ctx & { user: { id: string } }, campaignId: string | null) {
  if (!campaignId) return null;
  const role = await getCampaignRole(ctx, campaignId);
  if (!role) throw notFound();
  return role;
}

export async function loadNote(ctx: Ctx, noteId: string, opts: { trashed?: boolean } = {}): Promise<NoteRow> {
  const [row] = await ctx.db.select().from(notes).where(eq(notes.id, noteId));
  if (!row) throw notFound();
  if (!opts.trashed && row.deletedAt) throw notFound();
  return row;
}

export type NoteAccess = { row: NoteRow; access: NoteAccessInput };

/** Заметка с проверкой просмотра (`canViewNote`); чужая — NOT_FOUND. */
export async function loadViewable(ctx: Ctx, noteId: string, opts: { trashed?: boolean } = {}): Promise<NoteAccess> {
  const row = await loadNote(ctx, noteId, opts);
  const access = await noteAccessInput(ctx, row);
  if (!canViewNote(access)) throw notFound();
  return { row, access };
}

/** Заметка с проверкой правки (`canEditNote`). */
export async function loadEditable(ctx: Ctx, noteId: string): Promise<NoteAccess> {
  const res = await loadViewable(ctx, noteId);
  if (!canEditNote(res.access)) throw forbidden();
  return res;
}

export function permissionsOf(access: NoteAccessInput) {
  return {
    isAuthor: access.note.authorId === access.userId,
    canEdit: canEditNote(access),
    canTrash: canTrashNote(access),
    canShare: canShareNote(access),
  };
}

/** Персонаж, к которому привязывается заметка: зритель его видит, кампания та же. */
export async function assertCharacterForNote(ctx: Ctx, characterId: string, campaignId: string | null) {
  const [ch] = await ctx.db
    .select({ id: characters.id, ownerId: characters.ownerId, campaignId: characters.campaignId })
    .from(characters)
    .where(eq(characters.id, characterId));
  if (!ch || (await canViewCharacter(ctx, ch)) === 'none') throw notFound();
  if (ch.campaignId !== campaignId) throw badRequest('note_character_scope');
}

/** Личные заметки — только `private`: делиться вне кампании не с кем. */
export function normalizeVisibility(campaignId: string | null, v: NoteVisibilityValue): NoteVisibilityValue {
  return campaignId ? v : 'private';
}

/** Пересобрать `note_links` заметки по узлам документа и полям типа (§11.1). */
export async function rebuildLinks(tx: Tx | Db, noteId: string, doc: DocNode, type: NoteType, fields: Record<string, unknown>) {
  await tx.delete(noteLinks).where(eq(noteLinks.fromNoteId, noteId));
  const links = extractLinks(doc, type, fields).filter((l) => !(l.targetType === 'note' && l.targetId === noteId));
  if (links.length) {
    await tx.insert(noteLinks).values(links.map((l) => ({ fromNoteId: noteId, ...l })));
  }
}

export type NoteInsert = {
  /** Заданный id (импорт: ссылки между новыми заметками разрешаются до вставки). */
  id?: string;
  authorId: string;
  campaignId: string | null;
  characterId?: string | null;
  type: NoteType;
  title: string;
  body: DocNode;
  fields?: unknown;
  visibility: NoteVisibilityValue;
  sessionNo?: number | null;
  gameDate?: string | null;
  realDate?: string | null;
  pinned?: boolean;
};

export async function insertNote(tx: Tx | Db, n: NoteInsert): Promise<NoteRow> {
  const fields = parseNoteFields(n.type, n.fields);
  const now = new Date();
  const [row] = await tx
    .insert(notes)
    .values({
      ...(n.id ? { id: n.id } : {}),
      authorId: n.authorId,
      campaignId: n.campaignId,
      characterId: n.characterId ?? null,
      type: n.type,
      title: n.title,
      body: n.body,
      bodyText: docText(n.body),
      fields,
      visibility: normalizeVisibility(n.campaignId, n.visibility),
      sessionNo: n.sessionNo ?? null,
      gameDate: n.gameDate ?? null,
      realDate: n.realDate ?? null,
      pinned: n.pinned ?? false,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  await rebuildLinks(tx, row!.id, n.body, n.type, fields);
  return row!;
}

export type NotePatch = Partial<{
  title: string;
  body: DocNode;
  type: NoteType;
  fields: unknown;
  visibility: NoteVisibilityValue;
  sessionNo: number | null;
  gameDate: string | null;
  realDate: string | null;
  pinned: boolean;
  characterId: string | null;
}>;

/**
 * Сохранить изменения с проверкой `expectedUpdatedAt` (строка блокируется `FOR UPDATE`).
 * Перед изменением текста снимается версия прежнего содержимого, если с последней версии
 * прошло не меньше 5 минут (`forceVersion` — всегда, например при восстановлении версии).
 */
export async function updateNote(
  db: Db,
  actorId: string,
  noteId: string,
  expectedUpdatedAt: Date,
  patch: NotePatch,
  opts: { forceVersion?: boolean } = {},
): Promise<NoteRow> {
  return db.transaction(async (tx) => {
    const [cur] = await tx.select().from(notes).where(eq(notes.id, noteId)).for('update');
    if (!cur || cur.deletedAt) throw notFound();
    if (cur.updatedAt.getTime() !== expectedUpdatedAt.getTime()) throw conflict('note_conflict');
    const type = patch.type ?? cur.type;
    const fields =
      patch.fields !== undefined ? parseNoteFields(type, patch.fields) : patch.type ? readNoteFields(type, cur.fields) : (cur.fields as Record<string, unknown>);
    const body = patch.body ?? (cur.body as DocNode);
    const textChanged =
      (patch.title !== undefined && patch.title !== cur.title) ||
      (patch.body !== undefined && JSON.stringify(patch.body) !== JSON.stringify(cur.body));
    if (textChanged || opts.forceVersion) {
      const [last] = await tx
        .select({ createdAt: noteVersions.createdAt })
        .from(noteVersions)
        .where(eq(noteVersions.noteId, noteId))
        .orderBy(desc(noteVersions.createdAt))
        .limit(1);
      // Пустая заметка (только что созданная) версией не сохраняется.
      const empty = !cur.title && !cur.bodyText;
      if (opts.forceVersion || (!empty && (!last || Date.now() - last.createdAt.getTime() >= VERSION_INTERVAL_MS))) {
        await tx.insert(noteVersions).values({ noteId, title: cur.title, body: cur.body, authorId: actorId });
      }
    }
    const [row] = await tx
      .update(notes)
      .set({
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.body !== undefined ? { body: patch.body, bodyText: docText(patch.body) } : {}),
        ...(patch.visibility !== undefined ? { visibility: normalizeVisibility(cur.campaignId, patch.visibility) } : {}),
        ...(patch.sessionNo !== undefined ? { sessionNo: patch.sessionNo } : {}),
        ...(patch.gameDate !== undefined ? { gameDate: patch.gameDate } : {}),
        ...(patch.realDate !== undefined ? { realDate: patch.realDate } : {}),
        ...(patch.pinned !== undefined ? { pinned: patch.pinned } : {}),
        ...(patch.characterId !== undefined ? { characterId: patch.characterId } : {}),
        type,
        fields,
        updatedAt: new Date(),
      })
      .where(eq(notes.id, noteId))
      .returning();
    if (patch.body !== undefined || patch.fields !== undefined || patch.type !== undefined) {
      await rebuildLinks(tx, noteId, body, type, fields);
    }
    return row!;
  });
}

/** Теги заметок пачкой. */
export async function tagsForNotes(db: Db, ids: string[]) {
  if (!ids.length) return new Map<string, { id: string; name: string; color: string }[]>();
  const rows = await db
    .select({ noteId: noteTags.noteId, id: tags.id, name: tags.name, color: tags.color })
    .from(noteTags)
    .innerJoin(tags, eq(tags.id, noteTags.tagId))
    .where(inArray(noteTags.noteId, ids))
    .orderBy(tags.name);
  const map = new Map<string, { id: string; name: string; color: string }[]>();
  for (const r of rows) map.set(r.noteId, [...(map.get(r.noteId) ?? []), { id: r.id, name: r.name, color: r.color }]);
  return map;
}

/** Маркеры начала/конца совпадения в сниппетах (без HTML, §16.3). */
export const HL_START = '\u0001';
export const HL_END = '\u0002';

export function tsQuery(q: string): SQL {
  return sql`websearch_to_tsquery('russian', ${q})`;
}

export function headline(q: string): SQL<string> {
  return sql<string>`ts_headline('russian', ${notes.bodyText}, ${tsQuery(q)}, ${`StartSel=${HL_START}, StopSel=${HL_END}, MaxFragments=2, MaxWords=18, MinWords=6, FragmentDelimiter= … `})`;
}

/** Условия фильтра списка (§11.3). */
export function filterSql(f: NoteFilter): SQL[] {
  const w: SQL[] = [];
  if (f.types.length) w.push(inArray(notes.type, f.types));
  if (f.visibility.length) w.push(inArray(notes.visibility, f.visibility));
  if (f.sessionFrom !== undefined) w.push(sql`${notes.sessionNo} >= ${f.sessionFrom}`);
  if (f.sessionTo !== undefined) w.push(sql`${notes.sessionNo} <= ${f.sessionTo}`);
  if (f.characterId) w.push(eq(notes.characterId, f.characterId));
  if (f.authorId) w.push(eq(notes.authorId, f.authorId));
  if (f.pinned) w.push(eq(notes.pinned, true));
  if (f.handouts) w.push(eq(notes.isHandout, true));
  for (const t of f.tagsAll) w.push(sql`exists (select 1 from note_tags nt where nt.note_id = ${notes.id} and nt.tag_id = ${t})`);
  if (f.tagsAny.length) {
    w.push(
      sql`exists (select 1 from note_tags nt where nt.note_id = ${notes.id} and nt.tag_id in (${sql.join(
        f.tagsAny.map((t) => sql`${t}`),
        sql`, `,
      )}))`,
    );
  }
  if (f.text) {
    const like = `%${f.text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    w.push(sql`(${notes.search} @@ ${tsQuery(f.text)} or ${notes.title} ilike ${like})`);
  }
  return w;
}

export function notDeleted(trashed = false): SQL {
  return trashed ? isNotNull(notes.deletedAt) : isNull(notes.deletedAt);
}

/** Окончательно удалить заметки, пролежавшие в корзине 30 дней. */
export async function purgeTrash(db: Db, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - TRASH_DAYS * 86_400_000);
  const rows = await db.delete(notes).where(and(isNotNull(notes.deletedAt), lt(notes.deletedAt, cutoff))).returning({ id: notes.id });
  return rows.length;
}

/** Адресат раздаточного материала отмечает прочтение. */
export async function markShareRead(db: Db, noteId: string, userId: string) {
  await db
    .update(noteShares)
    .set({ readAt: new Date() })
    .where(and(eq(noteShares.noteId, noteId), eq(noteShares.userId, userId), isNull(noteShares.readAt)));
}
