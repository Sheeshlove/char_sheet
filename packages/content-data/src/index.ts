import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ContentEntity } from '@ps/content-schema';

/**
 * Корень пакета `@ps/content-data`: `CONTENT_DATA_DIR` из окружения, иначе каталог модуля,
 * иначе поиск `packages/content-data` вверх от рабочего каталога (в бандле Next.js
 * `import.meta.dirname` недоступен).
 */
export function contentDataDir(): string {
  const env = process.env.CONTENT_DATA_DIR;
  if (env) return env;
  const own = (import.meta as { dirname?: string }).dirname;
  if (own && existsSync(join(own, '..', 'dictionaries'))) return join(own, '..');
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, 'packages', 'content-data');
    if (existsSync(join(candidate, 'dictionaries'))) return candidate;
    dir = dirname(dir);
  }
  throw new Error('Не найден каталог packages/content-data (задайте CONTENT_DATA_DIR)');
}

export type PackManifest = {
  key: string;
  name: string;
  sourceType: 'srd' | 'dndsu' | 'homebrew';
  /** sha256 от содержимого JSON-файлов сущностей (SPEC §7.7). */
  version: string;
  source?: string;
  kinds: Record<string, number>;
};

export type LoadedPack = { manifest: PackManifest; entities: ContentEntity[] };

/** Каталоги пакетов, которые лежат в репозитории (`srd`, `dndsu`, …). */
export function listPackDirs(root = contentDataDir()): string[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(root, d.name, 'pack.json')))
    .map((d) => join(root, d.name));
}

/** Все пакеты из каталога (каталог может содержать несколько пакетов: `dndsu/official`, `dndsu/homebrew`). */
export function listPacks(root = contentDataDir()): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (existsSync(join(dir, 'pack.json'))) out.push(dir);
    if (depth > 1) return;
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      if (d.isDirectory() && !['node_modules', 'src', 'overlays', 'dictionaries'].includes(d.name)) walk(join(dir, d.name), depth + 1);
    }
  };
  walk(root, 0);
  return out.filter((d) => d !== root);
}

export function readPack(dir: string): LoadedPack {
  const manifest = JSON.parse(readFileSync(join(dir, 'pack.json'), 'utf8')) as PackManifest;
  const entities: ContentEntity[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json') && x !== 'pack.json').sort()) {
    const list = JSON.parse(readFileSync(join(dir, f), 'utf8')) as ContentEntity[];
    entities.push(...list);
  }
  return { manifest, entities };
}

export function readAllPacks(root = contentDataDir()): LoadedPack[] {
  return listPacks(root).map(readPack);
}

/** Версия пакета: sha256 от файлов сущностей в порядке имён. */
export function packVersion(files: { name: string; content: string }[]): string {
  const h = createHash('sha256');
  for (const f of [...files].sort((a, b) => a.name.localeCompare(b.name))) {
    h.update(f.name);
    h.update('\0');
    h.update(f.content);
    h.update('\0');
  }
  return h.digest('hex');
}
