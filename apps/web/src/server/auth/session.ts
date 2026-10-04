import { and, eq, ne } from 'drizzle-orm';
import type { Db } from '../db/client';
import { sessions, users } from '../db/schema';
import { generateToken, sha256Hex } from './crypto';

export const SESSION_COOKIE = 'ps_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_RENEW_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000;

export type AuthUser = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  isAdmin: boolean;
  avatarPath: string | null;
};

export type SessionInfo = { id: string; userId: string; expiresAt: Date };

export async function createSession(
  db: Db,
  userId: string,
  meta: { ip?: string; userAgent?: string },
): Promise<{ token: string; session: SessionInfo }> {
  const token = generateToken();
  const id = sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    id,
    userId,
    expiresAt,
    ip: meta.ip ?? null,
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
  });
  return { token, session: { id, userId, expiresAt } };
}

/**
 * Проверка токена. Истёкшая сессия удаляется. Если до конца срока меньше 15 дней —
 * срок продлевается до 30 дней (`renewed: true`, cookie нужно переустановить).
 */
export async function validateSessionToken(
  db: Db,
  token: string,
  now = new Date(),
): Promise<{ user: AuthUser; session: SessionInfo; renewed: boolean } | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const id = sha256Hex(token);
  const rows = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      id: users.id,
      email: users.email,
      username: users.username,
      displayName: users.displayName,
      isAdmin: users.isAdmin,
      avatarPath: users.avatarPath,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.expiresAt.getTime() <= now.getTime()) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  let expiresAt = row.expiresAt;
  let renewed = false;
  if (expiresAt.getTime() - now.getTime() < SESSION_RENEW_THRESHOLD_MS) {
    expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id));
    renewed = true;
  }
  const { sessionId, expiresAt: _e, ...user } = row;
  return { user, session: { id: sessionId, userId: user.id, expiresAt }, renewed };
}

export async function invalidateSession(db: Db, sessionId: string) {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

/** Удалить все сессии пользователя, кроме `exceptSessionId` (смена пароля, SPEC §5.1). */
export async function invalidateUserSessions(db: Db, userId: string, exceptSessionId?: string) {
  await db
    .delete(sessions)
    .where(
      exceptSessionId
        ? and(eq(sessions.userId, userId), ne(sessions.id, exceptSessionId))
        : eq(sessions.userId, userId),
    );
}

export function serializeSessionCookie(token: string, expiresAt: Date, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Expires=${expiresAt.toUTCString()}`,
    `Max-Age=${Math.floor((expiresAt.getTime() - Date.now()) / 1000)}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function serializeBlankSessionCookie(secure: boolean): string {
  const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function readCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}
