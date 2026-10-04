import type { Db } from './client';
import { users } from './schema';
import { hashPassword, MIN_PASSWORD_LENGTH } from '../auth/password';
import { countUsers } from '../services/auth';

/**
 * Первый администратор из ADMIN_EMAIL / ADMIN_PASSWORD, если таблица users пуста
 * (SPEC §4.1, §16.1). Без переменных — `missing-env`: тогда первый зарегистрировавшийся
 * пользователь становится администратором (экран регистрации в режиме первого запуска).
 */
export async function bootstrapAdmin(
  db: Db,
  env: { email?: string; password?: string },
): Promise<'created' | 'skipped' | 'missing-env'> {
  if ((await countUsers(db)) > 0) return 'skipped';
  const email = (env.email ?? '').trim().toLowerCase();
  const password = env.password ?? '';
  if (!email && !password) return 'missing-env';
  if (!email || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Нужны ADMIN_EMAIL и ADMIN_PASSWORD (не короче ${MIN_PASSWORD_LENGTH} символов)`);
  }
  const base = email.split('@')[0]!.replace(/[^a-z0-9_]/g, '_').slice(0, 32);
  const username = base.length >= 3 ? base : 'admin';
  await db.insert(users).values({
    email,
    username,
    displayName: username,
    passwordHash: await hashPassword(password),
    isAdmin: true,
  });
  return 'created';
}
