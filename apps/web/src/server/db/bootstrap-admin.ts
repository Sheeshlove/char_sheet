/**
 * `pnpm admin:bootstrap` — создаёт первого администратора из ADMIN_EMAIL / ADMIN_PASSWORD,
 * если таблица users пуста (SPEC §4.1, §16.1).
 */
import { getDb, getSql } from './client';
import { users } from './schema';
import { hashPassword } from '../auth/password';
import { countUsers } from '../services/auth';

export async function bootstrapAdmin(): Promise<'created' | 'skipped'> {
  const db = getDb();
  if ((await countUsers(db)) > 0) return 'skipped';
  const email = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? '';
  if (!email || password.length < 10) {
    throw new Error('Нужны ADMIN_EMAIL и ADMIN_PASSWORD (не короче 10 символов)');
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

if (import.meta.url === `file://${process.argv[1]}`) {
  bootstrapAdmin()
    .then(async (r) => {
      console.log(r === 'created' ? 'Администратор создан' : 'Пользователи уже есть — пропущено');
      await getSql().end();
    })
    .catch(async (e) => {
      console.error(e instanceof Error ? e.message : e);
      await getSql().end();
      process.exit(1);
    });
}
