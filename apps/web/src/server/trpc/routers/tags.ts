import { and, count, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { authedProcedure, router } from '../init';
import { noteTags, tags } from '../../db/schema';
import { isGmRole } from '../../auth/access';
import { getCampaignRole } from '../../auth/guards';
import { badRequest, conflict, forbidden, notFound } from '../errors';
import { loadEditable, requireScope } from '../../services/notes';
import { tagColorSchema } from '@/lib/notes/schema';
import type { Context } from '../context';
import type { AuthUser } from '../../auth/session';

/** Теги (§11.3): область — кампания (общие для её заметок) или пользователь (личные заметки). */

type Ctx = Pick<Context, 'db'> & { user: AuthUser };
const name = z.string().trim().min(1).max(40);

function scopeOf(userId: string, campaignId: string | null) {
  return campaignId ? { scopeType: 'campaign' as const, scopeId: campaignId } : { scopeType: 'user' as const, scopeId: userId };
}

/** Менять и удалять тег кампании может мастер, личный тег — владелец. */
async function loadManageable(ctx: Ctx, tagId: string) {
  const [tag] = await ctx.db.select().from(tags).where(eq(tags.id, tagId));
  if (!tag) throw notFound();
  if (tag.scopeType === 'user') {
    if (tag.scopeId !== ctx.user.id) throw notFound();
    return tag;
  }
  const role = await getCampaignRole(ctx, tag.scopeId);
  if (!role) throw notFound();
  if (!isGmRole(role)) throw forbidden();
  return tag;
}

function isUniqueViolation(e: unknown): boolean {
  const code = (e as { code?: string; cause?: { code?: string } })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
  return code === '23505';
}

export const tagsRouter = router({
  /** Теги области со счётчиком заметок. Гард: участник кампании (или свои). */
  list: authedProcedure.input(z.object({ campaignId: z.uuid().nullable() })).query(async ({ ctx, input }) => {
    await requireScope(ctx, input.campaignId);
    const s = scopeOf(ctx.user.id, input.campaignId);
    const rows = await ctx.db
      .select({ id: tags.id, name: tags.name, color: tags.color, n: count(noteTags.noteId) })
      .from(tags)
      .leftJoin(noteTags, eq(noteTags.tagId, tags.id))
      .where(and(eq(tags.scopeType, s.scopeType), eq(tags.scopeId, s.scopeId)))
      .groupBy(tags.id)
      .orderBy(tags.name);
    return rows;
  }),

  /** Создать. Гард: участник кампании (или свои личные). */
  create: authedProcedure
    .input(z.object({ campaignId: z.uuid().nullable(), name, color: tagColorSchema.default('#a3a3a3') }))
    .mutation(async ({ ctx, input }) => {
      await requireScope(ctx, input.campaignId);
      try {
        const [row] = await ctx.db
          .insert(tags)
          .values({ ...scopeOf(ctx.user.id, input.campaignId), name: input.name, color: input.color })
          .returning({ id: tags.id, name: tags.name, color: tags.color });
        return row!;
      } catch (e) {
        if (isUniqueViolation(e)) throw conflict('tag_exists');
        throw e;
      }
    }),

  /** Переименовать / перекрасить. Гард: мастер кампании или владелец личного тега. */
  update: authedProcedure
    .input(z.object({ tagId: z.uuid(), name: name.optional(), color: tagColorSchema.optional() }))
    .mutation(async ({ ctx, input }) => {
      await loadManageable(ctx, input.tagId);
      try {
        await ctx.db
          .update(tags)
          .set({ ...(input.name ? { name: input.name } : {}), ...(input.color ? { color: input.color } : {}) })
          .where(eq(tags.id, input.tagId));
      } catch (e) {
        if (isUniqueViolation(e)) throw conflict('tag_exists');
        throw e;
      }
      return { ok: true as const };
    }),

  /** Удалить (снимается со всех заметок). Гард: мастер кампании или владелец личного тега. */
  delete: authedProcedure.input(z.object({ tagId: z.uuid() })).mutation(async ({ ctx, input }) => {
    await loadManageable(ctx, input.tagId);
    await ctx.db.delete(tags).where(eq(tags.id, input.tagId));
    return { ok: true as const };
  }),

  /** Теги заметки целиком. Гард: `canEditNote`; теги — из области заметки. */
  setForNote: authedProcedure
    .input(z.object({ noteId: z.uuid(), tagIds: z.array(z.uuid()).max(30) }))
    .mutation(async ({ ctx, input }) => {
      const { row } = await loadEditable(ctx, input.noteId);
      const ids = [...new Set(input.tagIds)];
      const s = scopeOf(row.authorId, row.campaignId);
      if (ids.length) {
        const found = await ctx.db
          .select({ id: tags.id })
          .from(tags)
          .where(and(inArray(tags.id, ids), eq(tags.scopeType, s.scopeType), eq(tags.scopeId, s.scopeId)));
        if (found.length !== ids.length) throw badRequest('tag_scope');
      }
      await ctx.db.transaction(async (tx) => {
        await tx.delete(noteTags).where(eq(noteTags.noteId, row.id));
        if (ids.length) await tx.insert(noteTags).values(ids.map((tagId) => ({ noteId: row.id, tagId })));
      });
      return { ok: true as const };
    }),
});
