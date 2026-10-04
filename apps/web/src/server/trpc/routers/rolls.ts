import { randomInt } from 'node:crypto';
import { and, desc, eq, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { rollExpression, type RollResult } from '@ps/rules-engine';
import { authedProcedure, router } from '../init';
import { characters, rollLog, users } from '../../db/schema';
import { canEditCharacterState } from '../../auth/access';
import { characterAccessInput, getCampaignRole } from '../../auth/guards';
import { badRequest, forbidden, notFound } from '../errors';

/** Криптостойкий источник случайности для бросков на сервере. */
const rng = () => randomInt(0, 2 ** 32) / 2 ** 32;

/** Видимость броска — как у заметок (§4.7): свой, `party` — участники, `gm` — мастера. */
function visibleRollSql(userId: string): SQL {
  return sql`(
    ${rollLog.userId} = ${userId}
    or (${rollLog.visibility} = 'party' and exists (
      select 1 from campaign_members m where m.campaign_id = ${rollLog.campaignId} and m.user_id = ${userId}))
    or (${rollLog.visibility} = 'gm' and exists (
      select 1 from campaign_members m where m.campaign_id = ${rollLog.campaignId} and m.user_id = ${userId} and m.role in ('gm', 'co_gm')))
  )`;
}

export const rollsRouter = router({
  /**
   * Бросок на сервере с записью в журнал. Гард: участник кампании; бросок за персонажа —
   * право менять его состояние (владелец или мастер); вне кампании — только «для себя».
   */
  roll: authedProcedure
    .input(
      z.object({
        campaignId: z.uuid().nullable().default(null),
        characterId: z.uuid().nullable().default(null),
        expression: z.string().trim().min(1).max(100),
        mode: z.enum(['normal', 'advantage', 'disadvantage']).default('normal'),
        label: z.string().trim().max(120).default(''),
        visibility: z.enum(['private', 'gm', 'party']).default('party'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      let campaignId = input.campaignId;
      if (input.characterId) {
        const [ch] = await ctx.db
          .select({ ownerId: characters.ownerId, campaignId: characters.campaignId })
          .from(characters)
          .where(eq(characters.id, input.characterId));
        if (!ch) throw notFound();
        if (!canEditCharacterState(await characterAccessInput(ctx, ch))) throw forbidden();
        if (campaignId && ch.campaignId !== campaignId) throw badRequest();
        campaignId = ch.campaignId;
      }
      if (campaignId && !(await getCampaignRole(ctx, campaignId))) throw notFound();
      const result = rollExpression(input.expression, input.mode, rng);
      if (!result) throw badRequest('roll_invalid');
      const [row] = await ctx.db
        .insert(rollLog)
        .values({
          campaignId,
          characterId: input.characterId,
          userId: ctx.user.id,
          expression: result.expression,
          result,
          label: input.label,
          visibility: campaignId ? input.visibility : 'private',
        })
        .returning();
      return { id: row!.id, label: row!.label, visibility: row!.visibility, createdAt: row!.createdAt, result };
    }),

  /** Журнал бросков кампании (или своих вне кампаний). Гард: участник + видимость каждого броска. */
  list: authedProcedure
    .input(
      z.object({
        campaignId: z.uuid().nullable(),
        characterId: z.uuid().optional(),
        cursor: z.string().nullish(),
        limit: z.number().int().min(1).max(100).default(30),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (input.campaignId && !(await getCampaignRole(ctx, input.campaignId))) throw notFound();
      let cursorCond;
      if (input.cursor) {
        const [iso, id] = input.cursor.split('|');
        const at = new Date(iso ?? '');
        if (!id || Number.isNaN(at.getTime())) throw badRequest();
        cursorCond = or(lt(rollLog.createdAt, at), and(eq(rollLog.createdAt, at), lt(rollLog.id, id)));
      }
      const rows = await ctx.db
        .select({
          id: rollLog.id,
          expression: rollLog.expression,
          result: rollLog.result,
          label: rollLog.label,
          visibility: rollLog.visibility,
          createdAt: rollLog.createdAt,
          userId: rollLog.userId,
          userName: users.displayName,
          characterId: rollLog.characterId,
          characterName: characters.name,
        })
        .from(rollLog)
        .innerJoin(users, eq(users.id, rollLog.userId))
        .leftJoin(characters, eq(characters.id, rollLog.characterId))
        .where(
          and(
            input.campaignId ? eq(rollLog.campaignId, input.campaignId) : and(isNull(rollLog.campaignId), eq(rollLog.userId, ctx.user.id)),
            input.characterId ? eq(rollLog.characterId, input.characterId) : undefined,
            visibleRollSql(ctx.user.id),
            cursorCond,
          ),
        )
        .orderBy(desc(rollLog.createdAt), desc(rollLog.id))
        .limit(input.limit + 1);
      const items = rows.slice(0, input.limit).map((r) => ({ ...r, result: r.result as RollResult }));
      const last = items.at(-1);
      return { items, nextCursor: rows.length > input.limit && last ? `${last.createdAt.toISOString()}|${last.id}` : null };
    }),
});
