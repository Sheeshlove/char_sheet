import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { getDb } from '../db/client';
import { SESSION_COOKIE, type AuthUser } from './session';
import { sha256Hex } from './crypto';
import { eq } from 'drizzle-orm';
import { sessions, users } from '../db/schema';

/**
 * Текущий пользователь для серверных компонентов. Без продления сессии: продление и
 * переустановка cookie делаются в tRPC-запросах (SPEC §5.1), где можно выставить Set-Cookie.
 */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const db = getDb();
  const rows = await db
    .select({
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
    .where(eq(sessions.id, sha256Hex(token)))
    .limit(1);
  const row = rows[0];
  if (!row || row.expiresAt.getTime() <= Date.now()) return null;
  const { expiresAt: _e, ...user } = row;
  return user;
});

export async function requirePageUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

export async function requirePageAdmin(): Promise<AuthUser> {
  const user = await requirePageUser();
  if (!user.isAdmin) redirect('/');
  return user;
}
