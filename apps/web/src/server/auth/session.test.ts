import { describe, expect, it } from 'vitest';
import { readCookie, serializeBlankSessionCookie, serializeSessionCookie } from './session';
import { generateInviteCode, generateToken, sha256Hex } from './crypto';

describe('session helpers', () => {
  it('токен — 32 байта hex, в БД хранится sha256', () => {
    const t = generateToken();
    expect(t).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex(t)).not.toBe(t);
  });
  it('cookie: httpOnly, sameSite=lax, secure по флагу', () => {
    const c = serializeSessionCookie('abc', new Date(Date.now() + 1000_000), true);
    expect(c).toContain('ps_session=abc');
    expect(c).toContain('HttpOnly');
    expect(c).toContain('SameSite=Lax');
    expect(c).toContain('Secure');
    expect(serializeBlankSessionCookie(false)).toContain('Max-Age=0');
  });
  it('readCookie находит значение среди нескольких', () => {
    expect(readCookie('a=1; ps_session=tok; b=2', 'ps_session')).toBe('tok');
    expect(readCookie('a=1', 'ps_session')).toBeNull();
    expect(readCookie(null, 'ps_session')).toBeNull();
  });
  it('код приглашения — 12 символов base32', () => {
    expect(generateInviteCode()).toMatch(/^[A-Z2-7]{12}$/);
  });
});
