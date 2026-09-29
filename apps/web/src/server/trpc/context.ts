import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { getDb, type Db } from '../db/client';
import {
  readCookie,
  serializeSessionCookie,
  SESSION_COOKIE,
  validateSessionToken,
  type AuthUser,
  type SessionInfo,
} from '../auth/session';

export type Context = {
  db: Db;
  user: AuthUser | null;
  session: SessionInfo | null;
  ip: string;
  userAgent: string;
  /** Заголовки ответа (для Set-Cookie). null при серверных вызовах. */
  resHeaders: Headers | null;
  secureCookies: boolean;
};

export function clientIp(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return headers.get('x-real-ip') ?? 'local';
}

export function secureCookiesEnabled(): boolean {
  return (process.env.APP_URL ?? '').startsWith('https://');
}

export async function createContext({ req, resHeaders }: FetchCreateContextFnOptions): Promise<Context> {
  const db = getDb();
  const secureCookies = secureCookiesEnabled();
  const token = readCookie(req.headers.get('cookie'), SESSION_COOKIE);
  let user: AuthUser | null = null;
  let session: SessionInfo | null = null;
  if (token) {
    const res = await validateSessionToken(db, token);
    if (res) {
      user = res.user;
      session = res.session;
      if (res.renewed) {
        resHeaders.append('Set-Cookie', serializeSessionCookie(token, res.session.expiresAt, secureCookies));
      }
    }
  }
  return {
    db,
    user,
    session,
    ip: clientIp(req.headers),
    userAgent: req.headers.get('user-agent') ?? '',
    resHeaders,
    secureCookies,
  };
}
