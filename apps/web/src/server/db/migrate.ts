import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { fileURLToPath } from 'node:url';
import { getDb, getSql } from './client';

const migrationsFolder = fileURLToPath(new URL('../../../drizzle', import.meta.url));

export async function runMigrations() {
  await migrate(getDb(), { migrationsFolder });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(async () => {
      console.log('Миграции применены');
      await getSql().end();
    })
    .catch(async (e) => {
      console.error(e);
      await getSql().end();
      process.exit(1);
    });
}
