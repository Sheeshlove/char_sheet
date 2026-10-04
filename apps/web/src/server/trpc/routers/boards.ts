import { and, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { authedProcedure, router } from '../init';
import { boardEdges, boardNodes, boards, notes } from '../../db/schema';
import { canEditNote, canViewNote, type NoteAccessInput } from '../../auth/access';
import { getCampaignRole } from '../../auth/guards';
import { badRequest, forbidden, notFound } from '../errors';
import { loadViewable, normalizeVisibility, requireScope, visibleNoteSql } from '../../services/notes';
import { noteVisibilitySchema } from '@/lib/notes/schema';
import type { Context } from '../context';
import type { AuthUser } from '../../auth/session';

/**
 * Доски улик (§11.4). Видимость доски — как у заметок: гарды `canViewNote`/`canEditNote`
 * с владельцем доски в роли автора. Узлы с заметками, которых зритель не видит, скрыты.
 */

type Ctx = Pick<Context, 'db'> & { user: AuthUser };
type BoardRow = typeof boards.$inferSelect;

function visibleBoardSql(userId: string): SQL {
  return sql`(
    ${boards.ownerId} = ${userId}
    or (${boards.visibility} = 'party' and exists (
      select 1 from campaign_members m where m.campaign_id = ${boards.campaignId} and m.user_id = ${userId}))
    or (${boards.visibility} = 'gm' and exists (
      select 1 from campaign_members m where m.campaign_id = ${boards.campaignId} and m.user_id = ${userId} and m.role in ('gm', 'co_gm')))
  )`;
}

async function boardAccess(ctx: Ctx, b: BoardRow): Promise<NoteAccessInput> {
  return {
    userId: ctx.user.id,
    isAdmin: ctx.user.isAdmin,
    note: { authorId: b.ownerId, campaignId: b.campaignId, visibility: b.visibility },
    viewerRole: await getCampaignRole(ctx, b.campaignId),
    isShareRecipient: false,
  };
}

async function loadBoard(ctx: Ctx, boardId: string, need: 'view' | 'edit' | 'owner') {
  const [b] = await ctx.db.select().from(boards).where(eq(boards.id, boardId));
  if (!b) throw notFound();
  const access = await boardAccess(ctx, b);
  if (!canViewNote(access)) throw notFound();
  if (need === 'edit' && !canEditNote(access)) throw forbidden();
  if (need === 'owner' && b.ownerId !== ctx.user.id) throw forbidden();
  return { board: b, canEdit: canEditNote(access), isOwner: b.ownerId === ctx.user.id };
}

async function touch(ctx: Ctx, boardId: string) {
  await ctx.db.update(boards).set({ updatedAt: new Date() }).where(eq(boards.id, boardId));
}

const boardId = z.object({ boardId: z.uuid() });
const color = z.string().regex(/^#[0-9a-f]{6}$/i).nullable();
const coord = z.number().finite().min(-1e6).max(1e6);

export const boardsRouter = router({
  /** Доски области. Гард: участник кампании (или свои) + видимость доски. */
  list: authedProcedure.input(z.object({ campaignId: z.uuid().nullable() })).query(async ({ ctx, input }) => {
    await requireScope(ctx, input.campaignId);
    return ctx.db
      .select({ id: boards.id, name: boards.name, visibility: boards.visibility, ownerId: boards.ownerId, updatedAt: boards.updatedAt })
      .from(boards)
      .where(
        and(
          input.campaignId ? eq(boards.campaignId, input.campaignId) : and(isNull(boards.campaignId), eq(boards.ownerId, ctx.user.id)),
          visibleBoardSql(ctx.user.id),
        ),
      )
      .orderBy(desc(boards.updatedAt));
  }),

  /** Доска с узлами и связями. Гард: видимость доски; узлы — видимость заметок. */
  get: authedProcedure.input(boardId).query(async ({ ctx, input }) => {
    const { board, canEdit, isOwner } = await loadBoard(ctx, input.boardId, 'view');
    const nodes = await ctx.db
      .select({
        id: boardNodes.id,
        noteId: boardNodes.noteId,
        label: boardNodes.label,
        x: boardNodes.x,
        y: boardNodes.y,
        color: boardNodes.color,
        noteTitle: notes.title,
        noteType: notes.type,
      })
      .from(boardNodes)
      .leftJoin(notes, eq(notes.id, boardNodes.noteId))
      .where(and(eq(boardNodes.boardId, board.id), or(isNull(boardNodes.noteId), and(isNull(notes.deletedAt), visibleNoteSql(ctx.user.id)))));
    const ids = new Set(nodes.map((n) => n.id));
    const edges = (await ctx.db.select().from(boardEdges).where(eq(boardEdges.boardId, board.id))).filter(
      (e) => ids.has(e.fromNodeId) && ids.has(e.toNodeId),
    );
    return {
      id: board.id,
      name: board.name,
      visibility: board.visibility,
      campaignId: board.campaignId,
      canEdit,
      isOwner,
      nodes,
      edges: edges.map((e) => ({ id: e.id, fromNodeId: e.fromNodeId, toNodeId: e.toNodeId, label: e.label, style: e.style })),
    };
  }),

  /** Создать. Гард: участник кампании (или своя личная доска). */
  create: authedProcedure
    .input(z.object({ campaignId: z.uuid().nullable(), name: z.string().trim().min(1).max(120), visibility: noteVisibilitySchema.default('private') }))
    .mutation(async ({ ctx, input }) => {
      await requireScope(ctx, input.campaignId);
      const [row] = await ctx.db
        .insert(boards)
        .values({
          campaignId: input.campaignId,
          ownerId: ctx.user.id,
          name: input.name,
          visibility: normalizeVisibility(input.campaignId, input.visibility),
        })
        .returning({ id: boards.id });
      return row!;
    }),

  /** Переименовать; видимость меняет только владелец. Гард: правка доски. */
  update: authedProcedure
    .input(boardId.extend({ name: z.string().trim().min(1).max(120).optional(), visibility: noteVisibilitySchema.optional() }))
    .mutation(async ({ ctx, input }) => {
      const { board, isOwner } = await loadBoard(ctx, input.boardId, 'edit');
      if (input.visibility && input.visibility !== board.visibility && !isOwner) throw forbidden();
      await ctx.db
        .update(boards)
        .set({
          ...(input.name ? { name: input.name } : {}),
          ...(input.visibility ? { visibility: normalizeVisibility(board.campaignId, input.visibility) } : {}),
          updatedAt: new Date(),
        })
        .where(eq(boards.id, board.id));
      return { ok: true as const };
    }),

  /** Удалить. Гард: владелец. */
  delete: authedProcedure.input(boardId).mutation(async ({ ctx, input }) => {
    const { board } = await loadBoard(ctx, input.boardId, 'owner');
    await ctx.db.delete(boards).where(eq(boards.id, board.id));
    return { ok: true as const };
  }),

  nodes: router({
    /** Добавить или сдвинуть узлы пачкой (позиции — с дебаунсом). Гард: правка доски; заметки — видимые, той же области. */
    upsert: authedProcedure
      .input(
        boardId.extend({
          nodes: z
            .array(
              z.object({
                id: z.uuid().optional(),
                noteId: z.uuid().nullable().optional(),
                label: z.string().trim().max(200).nullable().optional(),
                x: coord,
                y: coord,
                color: color.optional(),
              }),
            )
            .min(1)
            .max(300),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { board } = await loadBoard(ctx, input.boardId, 'edit');
        const existing = input.nodes.filter((n) => n.id).map((n) => n.id!);
        if (existing.length) {
          const found = await ctx.db
            .select({ id: boardNodes.id })
            .from(boardNodes)
            .where(and(eq(boardNodes.boardId, board.id), inArray(boardNodes.id, existing)));
          if (found.length !== new Set(existing).size) throw notFound();
        }
        for (const n of input.nodes.filter((n) => !n.id && n.noteId)) {
          const { row } = await loadViewable(ctx, n.noteId!);
          if (row.campaignId !== board.campaignId) throw badRequest('board_note_scope');
        }
        const ids: string[] = [];
        await ctx.db.transaction(async (tx) => {
          for (const n of input.nodes) {
            if (n.id) {
              await tx
                .update(boardNodes)
                .set({
                  x: n.x,
                  y: n.y,
                  ...(n.label !== undefined ? { label: n.label } : {}),
                  ...(n.color !== undefined ? { color: n.color } : {}),
                })
                .where(eq(boardNodes.id, n.id));
              ids.push(n.id);
            } else {
              if (!n.noteId && !n.label) throw badRequest('board_node_empty');
              const [row] = await tx
                .insert(boardNodes)
                .values({ boardId: board.id, noteId: n.noteId ?? null, label: n.label ?? null, x: n.x, y: n.y, color: n.color ?? null })
                .returning({ id: boardNodes.id });
              ids.push(row!.id);
            }
          }
        });
        await touch(ctx, board.id);
        return { ids };
      }),
    /** Удалить узел (и его связи). Гард: правка доски. */
    delete: authedProcedure.input(boardId.extend({ nodeId: z.uuid() })).mutation(async ({ ctx, input }) => {
      const { board } = await loadBoard(ctx, input.boardId, 'edit');
      await ctx.db.delete(boardNodes).where(and(eq(boardNodes.id, input.nodeId), eq(boardNodes.boardId, board.id)));
      await touch(ctx, board.id);
      return { ok: true as const };
    }),
  }),

  edges: router({
    /** Добавить или изменить связь. Гард: правка доски; оба узла — этой доски. */
    upsert: authedProcedure
      .input(
        boardId.extend({
          id: z.uuid().optional(),
          fromNodeId: z.uuid(),
          toNodeId: z.uuid(),
          label: z.string().trim().max(120).nullable().default(null),
          style: z.enum(['solid', 'dashed']).default('solid'),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { board } = await loadBoard(ctx, input.boardId, 'edit');
        if (input.fromNodeId === input.toNodeId) throw badRequest('board_edge_self');
        const found = await ctx.db
          .select({ id: boardNodes.id })
          .from(boardNodes)
          .where(and(eq(boardNodes.boardId, board.id), inArray(boardNodes.id, [input.fromNodeId, input.toNodeId])));
        if (found.length !== 2) throw notFound();
        let id = input.id;
        if (id) {
          const res = await ctx.db
            .update(boardEdges)
            .set({ fromNodeId: input.fromNodeId, toNodeId: input.toNodeId, label: input.label, style: input.style })
            .where(and(eq(boardEdges.id, id), eq(boardEdges.boardId, board.id)))
            .returning({ id: boardEdges.id });
          if (!res.length) throw notFound();
        } else {
          const [row] = await ctx.db
            .insert(boardEdges)
            .values({ boardId: board.id, fromNodeId: input.fromNodeId, toNodeId: input.toNodeId, label: input.label, style: input.style })
            .returning({ id: boardEdges.id });
          id = row!.id;
        }
        await touch(ctx, board.id);
        return { id };
      }),
    /** Удалить связь. Гард: правка доски. */
    delete: authedProcedure.input(boardId.extend({ edgeId: z.uuid() })).mutation(async ({ ctx, input }) => {
      const { board } = await loadBoard(ctx, input.boardId, 'edit');
      await ctx.db.delete(boardEdges).where(and(eq(boardEdges.id, input.edgeId), eq(boardEdges.boardId, board.id)));
      await touch(ctx, board.id);
      return { ok: true as const };
    }),
  }),
});
