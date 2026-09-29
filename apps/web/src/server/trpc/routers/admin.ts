import { desc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { adminProcedure, router } from '../init';
import { siteInvites, users } from '../../db/schema';
import { generateInviteCode } from '../../auth/crypto';
import { siteInviteStatus } from '../../auth/invites';
import { createPasswordReset } from '../../services/auth';
import { badRequest, notFound } from '../errors';
import { adminPacksRouter } from './content';

const usedByUser = alias(users, 'used_by_user');

export const adminRouter = router({
  packs: adminPacksRouter,
  invites: router({
    create: adminProcedure
      .input(
        z.object({
          note: z.string().trim().max(200).default(''),
          expiresInDays: z.number().int().min(1).max(365).nullable().default(null),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const code = generateInviteCode();
        const expiresAt = input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000) : null;
        await ctx.db.insert(siteInvites).values({ code, createdBy: ctx.user.id, note: input.note, expiresAt });
        return { code };
      }),
    list: adminProcedure.query(async ({ ctx }) => {
      const rows = await ctx.db
        .select({
          code: siteInvites.code,
          note: siteInvites.note,
          createdAt: siteInvites.createdAt,
          expiresAt: siteInvites.expiresAt,
          usedAt: siteInvites.usedAt,
          usedBy: siteInvites.usedBy,
          revokedAt: siteInvites.revokedAt,
          usedByName: usedByUser.displayName,
        })
        .from(siteInvites)
        .leftJoin(usedByUser, eq(usedByUser.id, siteInvites.usedBy))
        .orderBy(desc(siteInvites.createdAt));
      const now = new Date();
      return rows.map((r) => ({ ...r, status: siteInviteStatus(r, now) }));
    }),
    revoke: adminProcedure.input(z.object({ code: z.string().max(64) })).mutation(async ({ ctx, input }) => {
      const res = await ctx.db
        .update(siteInvites)
        .set({ revokedAt: new Date() })
        .where(eq(siteInvites.code, input.code))
        .returning({ code: siteInvites.code });
      if (res.length === 0) throw notFound();
      return { ok: true };
    }),
  }),
  users: router({
    list: adminProcedure.query(async ({ ctx }) =>
      ctx.db
        .select({
          id: users.id,
          email: users.email,
          username: users.username,
          displayName: users.displayName,
          isAdmin: users.isAdmin,
          createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(users.createdAt),
    ),
    createResetLink: adminProcedure.input(z.object({ userId: z.uuid() })).mutation(async ({ ctx, input }) => {
      const [user] = await ctx.db.select({ id: users.id }).from(users).where(eq(users.id, input.userId));
      if (!user) throw notFound();
      const token = await createPasswordReset(ctx.db, input.userId);
      return { path: `/reset/${token}` };
    }),
    setAdmin: adminProcedure
      .input(z.object({ userId: z.uuid(), isAdmin: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        if (input.userId === ctx.user.id && !input.isAdmin) throw badRequest();
        await ctx.db.update(users).set({ isAdmin: input.isAdmin }).where(eq(users.id, input.userId));
        return { ok: true };
      }),
  }),
});
