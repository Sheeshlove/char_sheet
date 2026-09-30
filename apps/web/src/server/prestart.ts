/**
 * Подготовка перед запуском `web` в контейнере (SPEC §16.2): ожидание БД → миграции drizzle →
 * первый администратор (если пользователей нет) → `content:load` (только пакеты с новой
 * версией). Собирается esbuild в один файл `prestart.cjs` (см. Dockerfile).
 */
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { getDb, getSql } from './db/client';
import { bootstrapAdmin } from './db/bootstrap';
import { loadContentPacks } from './content/load';
import { errorFields, log } from './log';

async function waitForDb(attempts = 30): Promise<void> {
  for (let i = 1; ; i++) {
    try {
      await getDb().execute(sql`select 1`);
      return;
    } catch (e) {
      if (i >= attempts) throw e;
      log.warn({ attempt: i }, 'БД ещё недоступна, повтор через 2 с');
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

async function main() {
  const migrationsFolder = process.env.MIGRATIONS_DIR;
  if (!migrationsFolder) throw new Error('Не задан MIGRATIONS_DIR');
  const db = getDb();
  await waitForDb();
  await migrate(db, { migrationsFolder });
  log.info('миграции применены');

  const admin = await bootstrapAdmin(db, { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
  if (admin === 'created') log.info('создан первый администратор');
  if (admin === 'missing-env') log.warn('ADMIN_EMAIL/ADMIN_PASSWORD не заданы: первый зарегистрировавшийся станет администратором');

  for (const r of await loadContentPacks(db)) {
    log.info({ pack: r.pack, status: r.status, entities: r.entities, removed: r.removed }, 'content:load');
  }
}

main()
  .then(() => getSql().end())
  .catch(async (e: unknown) => {
    log.fatal(errorFields(e), 'подготовка к запуску не удалась');
    await getSql()
      .end()
      .catch(() => undefined);
    process.exit(1);
  });
