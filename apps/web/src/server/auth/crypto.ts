import { createHash, randomBytes } from 'node:crypto';

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

/** Случайная base32-строка из `bytes` байт энтропии (строчные буквы, без неоднозначных символов верхнего регистра). */
export function randomBase32(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += BASE32[bytes[i]! % 32];
  return out;
}

/** Токен сессии: 32 случайных байта в hex. В БД хранится только sha256. */
export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Код приглашения: 12 символов base32 (SPEC §4.1). */
export function generateInviteCode(): string {
  return randomBase32(12).toUpperCase();
}
