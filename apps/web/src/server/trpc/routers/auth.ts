import { and, desc, eq, gt } from 'drizzle-orm';
import { z } from 'zod';
import { authedProcedure, publicProcedure, router } from '../init';
import {
  changePasswordInput,
  loginInput,
  registerInput,
  resetWithTokenInput,
  updateProfileInput,
} from '@/lib/validation/auth';
import { changePassword, countUsers, loginUser, logout, registerUser, resetPasswordWithToken } from '../../services/auth';
import { serializeBlankSessionCookie, serializeSessionCookie, createSession } from '../../auth/session';
import { sessions, users } from '../../db/schema';
import { notFound } from '../errors';
import { log } from '../../log';

export const authRouter = router({
  /** Гард: публичный доступ (возвращает null для гостя). */
  me: publicProcedure.query(({ ctx }) => ctx.user),

  /** Гард: публичный доступ — нужен экрану регистрации, чтобы показать режим первого админа. */
  bootstrapNeeded: publicProcedure.query(async ({ ctx }) => (await countUsers(ctx.db)) === 0),

  /** Гард: публичный доступ, проверка приглашения внутри сервиса. */
  register: publicProcedure.input(registerInput).mutation(async ({ ctx, input }) => {
    const user = await registerUser(ctx.db, input);
    const { token, session } = await createSession(ctx.db, user.id, { ip: ctx.ip, userAgent: ctx.userAgent });
    ctx.resHeaders?.append('Set-Cookie', serializeSessionCookie(token, session.expiresAt, ctx.secureCookies));
    return { id: user.id };
  }),

  /** Гард: публичный доступ с ограничением попыток (SPEC §5.1). */
  login: publicProcedure.input(loginInput).mutation(async ({ ctx, input }) => {
    const result = await loginUser(ctx.db, input, { ip: ctx.ip, userAgent: ctx.userAgent }).catch((e: unknown) => {
      // В лог — только адрес и код отказа, без логина и пароля.
      log.warn({ event: 'login_failed', ip: ctx.ip, code: (e as { code?: unknown }).code }, 'неудачная попытка входа');
      throw e;
    });
    log.info({ event: 'login', userId: result.user.id, ip: ctx.ip }, 'вход');
    ctx.resHeaders?.append('Set-Cookie', serializeSessionCookie(result.token, result.session.expiresAt, ctx.secureCookies));
    return { id: result.user.id };
  }),

  logout: authedProcedure.mutation(async ({ ctx }) => {
    if (ctx.session) await logout(ctx.db, ctx.session.id);
    ctx.resHeaders?.append('Set-Cookie', serializeBlankSessionCookie(ctx.secureCookies));
    return { ok: true };
  }),

  updateProfile: authedProcedure.input(updateProfileInput).mutation(async ({ ctx, input }) => {
    await ctx.db.update(users).set({ displayName: input.displayName }).where(eq(users.id, ctx.user.id));
    return { ok: true };
  }),

  changePassword: authedProcedure.input(changePasswordInput).mutation(async ({ ctx, input }) => {
    await changePassword(ctx.db, ctx.user.id, ctx.session?.id ?? '', input);
    return { ok: true };
  }),

  /** Гард: публичный доступ, право подтверждается одноразовым токеном. */
  resetWithToken: publicProcedure.input(resetWithTokenInput).mutation(async ({ ctx, input }) => {
    await resetPasswordWithToken(ctx.db, input.token, input.password);
    return { ok: true };
  }),

  sessions: router({
    list: authedProcedure.query(async ({ ctx }) => {
      const rows = await ctx.db
        .select({
          id: sessions.id,
          createdAt: sessions.createdAt,
          expiresAt: sessions.expiresAt,
          userAgent: sessions.userAgent,
          ip: sessions.ip,
        })
        .from(sessions)
        .where(and(eq(sessions.userId, ctx.user.id), gt(sessions.expiresAt, new Date())))
        .orderBy(desc(sessions.createdAt));
      return rows.map((r) => ({ ...r, current: r.id === ctx.session?.id }));
    }),
    revoke: authedProcedure.input(z.object({ id: z.string().regex(/^[0-9a-f]{64}$/) })).mutation(async ({ ctx, input }) => {
      const res = await ctx.db
        .delete(sessions)
        .where(and(eq(sessions.id, input.id), eq(sessions.userId, ctx.user.id)))
        .returning({ id: sessions.id });
      if (res.length === 0) throw notFound();
      if (input.id === ctx.session?.id) {
        ctx.resHeaders?.append('Set-Cookie', serializeBlankSessionCookie(ctx.secureCookies));
      }
      return { ok: true };
    }),
  }),
});
