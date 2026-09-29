import { and, asc, count, desc, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { campaignSettingsSchema, DEFAULT_CAMPAIGN_SETTINGS, parseCampaignSettings } from '@ps/content-schema';
import { authedProcedure, router } from '../init';
import { campaignInvites, campaignMembers, campaigns, characters, users } from '../../db/schema';
import { requireCampaignRole } from '../../auth/guards';
import { canCampaign } from '../../auth/access';
import { generateInviteCode } from '../../auth/crypto';
import { badRequest, forbidden, notFound } from '../errors';
import type { Db } from '../../db/client';

const idInput = z.object({ campaignId: z.uuid() });

async function assertCan(
  ctx: Parameters<typeof requireCampaignRole>[0],
  campaignId: string,
  action: Parameters<typeof canCampaign>[0],
) {
  const role = await requireCampaignRole(ctx, campaignId);
  if (!canCampaign(action, role)) throw forbidden();
  return role;
}

export const campaignsRouter = router({
  list: authedProcedure.query(async ({ ctx }) => {
    const memberCount = ctx.db
      .select({ campaignId: campaignMembers.campaignId, n: count().as('n') })
      .from(campaignMembers)
      .groupBy(campaignMembers.campaignId)
      .as('mc');
    const rows = await ctx.db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        description: campaigns.description,
        archivedAt: campaigns.archivedAt,
        role: campaignMembers.role,
        members: memberCount.n,
        updatedAt: campaigns.updatedAt,
      })
      .from(campaignMembers)
      .innerJoin(campaigns, eq(campaigns.id, campaignMembers.campaignId))
      .leftJoin(memberCount, eq(memberCount.campaignId, campaigns.id))
      .where(eq(campaignMembers.userId, ctx.user.id))
      .orderBy(desc(campaigns.updatedAt));
    return rows.map((r) => ({ ...r, members: Number(r.members ?? 0) }));
  }),

  get: authedProcedure.input(idInput).query(async ({ ctx, input }) => {
    const role = await requireCampaignRole(ctx, input.campaignId);
    const [c] = await ctx.db.select().from(campaigns).where(eq(campaigns.id, input.campaignId));
    if (!c) throw notFound();
    const [owner] = await ctx.db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, c.ownerId));
    return {
      id: c.id,
      name: c.name,
      description: c.description,
      ownerId: c.ownerId,
      ownerName: owner?.displayName ?? '',
      archivedAt: c.archivedAt,
      settings: parseCampaignSettings(c.settings),
      role,
    };
  }),

  create: authedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(120),
        description: z.string().trim().max(4000).default(''),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const [c] = await tx
          .insert(campaigns)
          .values({
            name: input.name,
            description: input.description,
            ownerId: ctx.user.id,
            settings: DEFAULT_CAMPAIGN_SETTINGS,
          })
          .returning({ id: campaigns.id });
        if (!c) throw badRequest();
        await tx.insert(campaignMembers).values({ campaignId: c.id, userId: ctx.user.id, role: 'gm' });
        return { id: c.id };
      });
    }),

  update: authedProcedure
    .input(
      idInput.extend({
        name: z.string().trim().min(1).max(120),
        description: z.string().trim().max(4000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertCan(ctx, input.campaignId, 'update');
      await ctx.db
        .update(campaigns)
        .set({ name: input.name, description: input.description })
        .where(eq(campaigns.id, input.campaignId));
      return { ok: true };
    }),

  updateSettings: authedProcedure
    .input(idInput.extend({ settings: campaignSettingsSchema }))
    .mutation(async ({ ctx, input }) => {
      await assertCan(ctx, input.campaignId, 'update_settings');
      await ctx.db.update(campaigns).set({ settings: input.settings }).where(eq(campaigns.id, input.campaignId));
      return { ok: true };
    }),

  archive: authedProcedure
    .input(idInput.extend({ archived: z.boolean().default(true) }))
    .mutation(async ({ ctx, input }) => {
      await assertCan(ctx, input.campaignId, 'archive');
      await ctx.db
        .update(campaigns)
        .set({ archivedAt: input.archived ? new Date() : null })
        .where(eq(campaigns.id, input.campaignId));
      return { ok: true };
    }),

  invites: router({
    create: authedProcedure
      .input(
        idInput.extend({
          maxUses: z.number().int().min(1).max(1000).nullable().default(null),
          expiresInDays: z.number().int().min(1).max(365).nullable().default(null),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await assertCan(ctx, input.campaignId, 'invite');
        const code = generateInviteCode();
        await ctx.db.insert(campaignInvites).values({
          code,
          campaignId: input.campaignId,
          createdBy: ctx.user.id,
          maxUses: input.maxUses,
          expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000) : null,
        });
        return { code };
      }),
    list: authedProcedure.input(idInput).query(async ({ ctx, input }) => {
      await assertCan(ctx, input.campaignId, 'invite');
      const now = new Date();
      return ctx.db
        .select()
        .from(campaignInvites)
        .where(
          and(
            eq(campaignInvites.campaignId, input.campaignId),
            isNull(campaignInvites.revokedAt),
            or(isNull(campaignInvites.expiresAt), gt(campaignInvites.expiresAt, now)),
            or(isNull(campaignInvites.maxUses), lt(campaignInvites.uses, campaignInvites.maxUses)),
          ),
        )
        .orderBy(desc(campaignInvites.createdAt));
    }),
    revoke: authedProcedure
      .input(idInput.extend({ code: z.string().max(64) }))
      .mutation(async ({ ctx, input }) => {
        await assertCan(ctx, input.campaignId, 'invite');
        await ctx.db
          .update(campaignInvites)
          .set({ revokedAt: new Date() })
          .where(and(eq(campaignInvites.code, input.code), eq(campaignInvites.campaignId, input.campaignId)));
        return { ok: true };
      }),
    /** Гард: вошедший пользователь; показывает название кампании по коду перед вступлением. */
    preview: authedProcedure.input(z.object({ code: z.string().max(64) })).query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select({
          code: campaignInvites.code,
          campaignId: campaigns.id,
          name: campaigns.name,
          description: campaigns.description,
          expiresAt: campaignInvites.expiresAt,
          revokedAt: campaignInvites.revokedAt,
          maxUses: campaignInvites.maxUses,
          uses: campaignInvites.uses,
        })
        .from(campaignInvites)
        .innerJoin(campaigns, eq(campaigns.id, campaignInvites.campaignId))
        .where(eq(campaignInvites.code, input.code.toUpperCase()));
      if (!row || !inviteUsable(row)) throw notFound('campaignInviteInvalid');
      const [member] = await ctx.db
        .select({ role: campaignMembers.role })
        .from(campaignMembers)
        .where(and(eq(campaignMembers.campaignId, row.campaignId), eq(campaignMembers.userId, ctx.user.id)));
      return { campaignId: row.campaignId, name: row.name, description: row.description, alreadyMember: !!member };
    }),
  }),

  join: authedProcedure.input(z.object({ code: z.string().max(64) })).mutation(async ({ ctx, input }) => {
    const code = input.code.toUpperCase();
    return ctx.db.transaction(async (tx) => {
      const [inv] = await tx
        .select()
        .from(campaignInvites)
        .where(eq(campaignInvites.code, code))
        .for('update');
      if (!inv || !inviteUsable(inv)) throw notFound('campaignInviteInvalid');
      const [existing] = await tx
        .select({ role: campaignMembers.role })
        .from(campaignMembers)
        .where(and(eq(campaignMembers.campaignId, inv.campaignId), eq(campaignMembers.userId, ctx.user.id)));
      if (existing) return { campaignId: inv.campaignId, alreadyMember: true };
      await tx.insert(campaignMembers).values({ campaignId: inv.campaignId, userId: ctx.user.id, role: 'player' });
      await tx
        .update(campaignInvites)
        .set({ uses: sql`${campaignInvites.uses} + 1` })
        .where(eq(campaignInvites.code, code));
      return { campaignId: inv.campaignId, alreadyMember: false };
    });
  }),

  leave: authedProcedure.input(idInput).mutation(async ({ ctx, input }) => {
    await requireCampaignRole(ctx, input.campaignId);
    const [c] = await ctx.db.select({ ownerId: campaigns.ownerId }).from(campaigns).where(eq(campaigns.id, input.campaignId));
    if (c?.ownerId === ctx.user.id) throw badRequest('ownerCannotLeave');
    await removeMember(ctx.db, input.campaignId, ctx.user.id);
    return { ok: true };
  }),

  members: router({
    list: authedProcedure.input(idInput).query(async ({ ctx, input }) => {
      await requireCampaignRole(ctx, input.campaignId);
      return ctx.db
        .select({
          userId: users.id,
          displayName: users.displayName,
          username: users.username,
          role: campaignMembers.role,
          joinedAt: campaignMembers.joinedAt,
        })
        .from(campaignMembers)
        .innerJoin(users, eq(users.id, campaignMembers.userId))
        .where(eq(campaignMembers.campaignId, input.campaignId))
        .orderBy(asc(campaignMembers.joinedAt));
    }),
    setRole: authedProcedure
      .input(idInput.extend({ userId: z.uuid(), role: z.enum(['co_gm', 'player']) }))
      .mutation(async ({ ctx, input }) => {
        await assertCan(ctx, input.campaignId, 'set_role');
        if (input.userId === ctx.user.id) throw badRequest();
        const res = await ctx.db
          .update(campaignMembers)
          .set({ role: input.role })
          .where(and(eq(campaignMembers.campaignId, input.campaignId), eq(campaignMembers.userId, input.userId)))
          .returning({ userId: campaignMembers.userId });
        if (res.length === 0) throw notFound();
        return { ok: true };
      }),
    remove: authedProcedure
      .input(idInput.extend({ userId: z.uuid() }))
      .mutation(async ({ ctx, input }) => {
        await assertCan(ctx, input.campaignId, 'remove_member');
        const [c] = await ctx.db
          .select({ ownerId: campaigns.ownerId })
          .from(campaigns)
          .where(eq(campaigns.id, input.campaignId));
        if (c?.ownerId === input.userId) throw badRequest('cannotRemoveOwner');
        await removeMember(ctx.db, input.campaignId, input.userId);
        return { ok: true };
      }),
  }),

  /** Список активных кампаний пользователя (для выбора при привязке персонажа). */
  mine: authedProcedure.query(async ({ ctx }) =>
    ctx.db
      .select({ id: campaigns.id, name: campaigns.name, role: campaignMembers.role })
      .from(campaignMembers)
      .innerJoin(campaigns, eq(campaigns.id, campaignMembers.campaignId))
      .where(and(eq(campaignMembers.userId, ctx.user.id), isNull(campaigns.archivedAt)))
      .orderBy(asc(campaigns.name)),
  ),
});

function inviteUsable(inv: {
  revokedAt: Date | null;
  expiresAt: Date | null;
  maxUses: number | null;
  uses: number;
}): boolean {
  if (inv.revokedAt) return false;
  if (inv.expiresAt && inv.expiresAt.getTime() <= Date.now()) return false;
  if (inv.maxUses !== null && inv.uses >= inv.maxUses) return false;
  return true;
}

/** Исключение участника: его персонажи отвязываются от кампании. */
async function removeMember(db: Db, campaignId: string, userId: string) {
  await db.transaction(async (tx) => {
    await tx
      .delete(campaignMembers)
      .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, userId)));
    await tx
      .update(characters)
      .set({ campaignId: null })
      .where(and(eq(characters.campaignId, campaignId), eq(characters.ownerId, userId)));
  });
}
