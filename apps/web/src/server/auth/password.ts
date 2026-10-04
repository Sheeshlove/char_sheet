import { hash, verify } from '@node-rs/argon2';

export const MIN_PASSWORD_LENGTH = 10;

// Argon2id — алгоритм по умолчанию в @node-rs/argon2; параметры — рекомендации OWASP.
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}
