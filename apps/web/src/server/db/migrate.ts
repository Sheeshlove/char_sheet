/** `pnpm db:migrate` — применить миграции drizzle из `apps/web/drizzle`. */
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { fileURLToPath } from 'node:url';
import { getDb, getSql } from './client';

const migrationsFolder = process.env.MIGRATIONS_DIR ?? fileURLToPath(new URL('../../../drizzle', import.meta.url));

migrate(getDb(), { migrationsFolder })
  .then(async () => {
    console.log('Миграции применены');
    await getSql().end();
  })
  .catch(async (e) => {
    console.error(e);
    await getSql().end();
    process.exit(1);
  });
