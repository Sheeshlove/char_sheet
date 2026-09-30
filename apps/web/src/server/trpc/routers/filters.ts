import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { authedProcedure, router } from '../init';
import { savedFilters } from '../../db/schema';
import { notFound } from '../errors';
import { requireScope } from '../../services/notes';
import { noteFilterSchema } from '@/lib/notes/schema';

/** Сохранённые фильтры заметок (§11.3) — у каждого пользователя свои. */
export const filtersRouter = router({
  /** Мои фильтры области. Гард: участник кампании (или свои личные). */
  list: authedProcedure.input(z.object({ campaignId: z.uuid().nullable() })).query(async ({ ctx, input }) => {
    await requireScope(ctx, input.campaignId);
    const rows = await ctx.db
      .select()
      .from(savedFilters)
      .where(
        and(
          eq(savedFilters.ownerId, ctx.user.id),
          input.campaignId ? eq(savedFilters.campaignId, input.campaignId) : isNull(savedFilters.campaignId),
        ),
      )
      .orderBy(desc(savedFilters.createdAt));
    return rows.map((r) => {
      const q = noteFilterSchema.safeParse(r.query);
      return { id: r.id, name: r.name, query: q.success ? q.data : noteFilterSchema.parse({}) };
    });
  }),

  /** Сохранить. Гард: участник кампании (или свои личные). */
  save: authedProcedure
    .input(z.object({ campaignId: z.uuid().nullable(), name: z.string().trim().min(1).max(80), query: noteFilterSchema }))
    .mutation(async ({ ctx, input }) => {
      await requireScope(ctx, input.campaignId);
      const [row] = await ctx.db
        .insert(savedFilters)
        .values({ ownerId: ctx.user.id, campaignId: input.campaignId, name: input.name, query: input.query })
        .returning({ id: savedFilters.id });
      return row!;
    }),

  /** Удалить. Гард: владелец фильтра. */
  delete: authedProcedure.input(z.object({ filterId: z.uuid() })).mutation(async ({ ctx, input }) => {
    const res = await ctx.db
      .delete(savedFilters)
      .where(and(eq(savedFilters.id, input.filterId), eq(savedFilters.ownerId, ctx.user.id)))
      .returning({ id: savedFilters.id });
    if (!res.length) throw notFound();
    return { ok: true as const };
  }),
});
