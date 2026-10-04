import { getDb } from '../db/client';
import { readCookie, SESSION_COOKIE, validateSessionToken, type AuthUser } from './session';

/** Пользователь для обычных route handlers (не tRPC). */
export async function getRouteUser(req: Request): Promise<AuthUser | null> {
  const token = readCookie(req.headers.get('cookie'), SESSION_COOKIE);
  if (!token) return null;
  const res = await validateSessionToken(getDb(), token);
  return res?.user ?? null;
}
