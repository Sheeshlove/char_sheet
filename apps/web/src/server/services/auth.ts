import { and, count, eq, gt, isNull, or, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { passwordResets, sessions, siteInvites, users } from '../db/schema';
import { hashPassword, verifyPassword } from '../auth/password';
import { createSession, invalidateSession, invalidateUserSessions } from '../auth/session';
import { checkSiteInvite } from '../auth/invites';
import { loginLimiter } from '../auth/rate-limit';
import { generateToken, sha256Hex } from '../auth/crypto';
import { appError, badRequest, conflict } from '../trpc/errors';

// Хэш для выравнивания времени ответа, когда пользователь не найден.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hashPassword('dummy-password-for-timing'));

export async function countUsers(db: Db): Promise<number> {
  const [row] = await db.select({ n: count() }).from(users);
  return row?.n ?? 0;
}

export type RegisterData = {
  email: string;
  username: string;
  displayName: string;
  password: string;
  inviteCode: string;
};

/**
 * Регистрация по приглашению (SPEC §5.1). Исключение — самый первый пользователь при пустой
 * таблице `users`: он регистрируется без кода и становится администратором (SPEC §4.1).
 */
export async function registerUser(db: Db, data: RegisterData) {
  const passwordHash = await hashPassword(data.password);
  return db.transaction(async (tx) => {
    // Сериализуем регистрации, чтобы «первый пользователь» и инвайты не гонялись.
    await tx.execute(sql`select pg_advisory_xact_lock(4242001)`);
    const existing = await tx
      .select({ email: users.email, username: users.username })
      .from(users)
      .where(or(eq(users.email, data.email), eq(users.username, data.username)));
    if (existing.some((u) => u.email === data.email)) throw conflict('emailTaken');
    if (existing.some((u) => u.username === data.username)) throw conflict('usernameTaken');

    const [{ n } = { n: 0 }] = await tx.select({ n: count() }).from(users);
    const isFirst = n === 0;

    if (!isFirst) {
      const [invite] = await tx.select().from(siteInvites).where(eq(siteInvites.code, data.inviteCode)).limit(1);
      const problem = checkSiteInvite(invite);
      if (problem) throw badRequest(problem);
    }

    const [user] = await tx
      .insert(users)
      .values({
        email: data.email,
        username: data.username,
        displayName: data.displayName,
        passwordHash,
        isAdmin: isFirst,
      })
      .returning();
    if (!user) throw appError('INTERNAL_SERVER_ERROR');

    if (!isFirst) {
      const claimed = await tx
        .update(siteInvites)
        .set({ usedBy: user.id, usedAt: new Date() })
        .where(
          and(
            eq(siteInvites.code, data.inviteCode),
            isNull(siteInvites.usedBy),
            isNull(siteInvites.revokedAt),
            or(isNull(siteInvites.expiresAt), gt(siteInvites.expiresAt, new Date())),
          ),
        )
        .returning({ code: siteInvites.code });
      if (claimed.length === 0) throw badRequest('inviteUsed');
    }
    return user;
  });
}

export async function loginUser(
  db: Db,
  input: { login: string; password: string },
  meta: { ip: string; userAgent: string },
) {
  const login = input.login.trim().toLowerCase();
  if (loginLimiter.isBlocked(meta.ip, login)) throw appError('TOO_MANY_REQUESTS', 'tooManyAttempts');

  const [user] = await db
    .select()
    .from(users)
    .where(or(eq(users.email, login), eq(users.username, login)))
    .limit(1);

  const ok = user
    ? await verifyPassword(user.passwordHash, input.password)
    : (await verifyPassword(await getDummyHash(), input.password)) && false;

  if (!user || !ok) {
    loginLimiter.recordFailure(meta.ip, login);
    throw appError('UNAUTHORIZED', 'invalidCredentials');
  }
  loginLimiter.reset(meta.ip, login);
  const { token, session } = await createSession(db, user.id, meta);
  return { user, token, session };
}

export async function changePassword(
  db: Db,
  userId: string,
  currentSessionId: string,
  input: { currentPassword: string; newPassword: string },
) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw appError('NOT_FOUND');
  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) throw badRequest('wrongPassword');
  const passwordHash = await hashPassword(input.newPassword);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
  await invalidateUserSessions(db, userId, currentSessionId);
}

export const RESET_TTL_MS = 24 * 60 * 60 * 1000;

/** Одноразовая ссылка сброса пароля на 24 часа; выдаёт админ (SPEC §5.1). */
export async function createPasswordReset(db: Db, userId: string): Promise<string> {
  const token = generateToken();
  await db.insert(passwordResets).values({
    tokenHash: sha256Hex(token),
    userId,
    expiresAt: new Date(Date.now() + RESET_TTL_MS),
  });
  return token;
}

export async function resetPasswordWithToken(db: Db, token: string, password: string) {
  const tokenHash = sha256Hex(token);
  const passwordHash = await hashPassword(password);
  await db.transaction(async (tx) => {
    const [reset] = await tx
      .delete(passwordResets)
      .where(and(eq(passwordResets.tokenHash, tokenHash), gt(passwordResets.expiresAt, new Date())))
      .returning();
    if (!reset) throw badRequest('resetInvalid');
    await tx.update(users).set({ passwordHash }).where(eq(users.id, reset.userId));
    await tx.delete(passwordResets).where(eq(passwordResets.userId, reset.userId));
    await tx.delete(sessions).where(eq(sessions.userId, reset.userId));
  });
}

export async function logout(db: Db, sessionId: string) {
  await invalidateSession(db, sessionId);
}
