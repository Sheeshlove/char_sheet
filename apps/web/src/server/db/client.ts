import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

export type Db = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __psSql?: postgres.Sql; __psDb?: Db };

export function getSql(): postgres.Sql {
  if (!globalForDb.__psSql) {
    const url = process.env.DATABASE_URL ?? 'postgres://party:party@localhost:5432/party_sheet';
    globalForDb.__psSql = postgres(url, { max: 10, onnotice: () => {} });
  }
  return globalForDb.__psSql;
}

export function getDb(): Db {
  if (!globalForDb.__psDb) {
    globalForDb.__psDb = drizzle(getSql(), { schema });
  }
  return globalForDb.__psDb;
}

export { schema };
