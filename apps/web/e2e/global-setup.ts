import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

/** Чистая тестовая БД для e2e: пересоздаём схему и применяем миграции. */
export default async function globalSetup() {
  const url = process.env.E2E_DATABASE_URL ?? 'postgres://party:party@localhost:5432/party_sheet_test';
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await sql.unsafe('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;');
  await migrate(drizzle(sql), { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
  await sql.end();
  // Контент SRD для справочника и конструктора.
  execFileSync('pnpm', ['exec', 'tsx', 'src/server/content/load-cli.ts'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
}
