import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { Section } from './sections';

export type ManifestEntry = {
  url: string;
  /** Путь к HTML относительно каталога кэша. */
  file: string;
  section: Section;
  homebrew: boolean;
  /** `list` — страница-список секции, `entity` — страница сущности. */
  type: 'list' | 'entity';
  externalId?: number;
  slug?: string;
  /** Для подклассов: URL страницы класса, с которой найдена ссылка. */
  parentUrl?: string;
  fetchedAt: string;
  sha256: string;
  status: number;
  via?: string;
  /** Для списков: сколько ссылок на сущности найдено (сверка количества, SPEC §17 M5). */
  linkCount?: number;
};

export type Manifest = { version: 1; entries: Record<string, ManifestEntry> };

export const FRESH_DAYS = 30;

export function importerRoot(): string {
  // src/dndsu → корень пакета importer
  const own = (import.meta as { dirname?: string }).dirname;
  if (own) return resolve(own, '..', '..');
  return resolve(process.cwd());
}

export function defaultCacheDir(): string {
  return process.env.DNDSU_CACHE_DIR ?? join(importerRoot(), 'cache');
}

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

/** Путь файла кэша: `cache/<section>/<id>-<slug>.html`, homebrew — `cache/homebrew/<section>/…`. */
export function cacheFileFor(e: {
  section: Section;
  homebrew: boolean;
  type: 'list' | 'entity';
  externalId?: number;
  slug?: string;
}): string {
  const dir = `${e.homebrew ? 'homebrew/' : ''}${e.section}`;
  return e.type === 'list' ? `${dir}/_list.html` : `${dir}/${e.externalId}-${e.slug}.html`;
}

/** Кэш сырого HTML + `manifest.json` (SPEC §7.4). */
export class CrawlCache {
  readonly manifest: Manifest;

  constructor(readonly dir: string = defaultCacheDir()) {
    const path = join(dir, 'manifest.json');
    this.manifest = existsSync(path)
      ? (JSON.parse(readFileSync(path, 'utf8')) as Manifest)
      : { version: 1, entries: {} };
  }

  entry(url: string): ManifestEntry | undefined {
    return this.manifest.entries[url];
  }

  /**
   * Свежая ли страница: есть в кэше, скачана успешно, моложе `FRESH_DAYS` дней
   * и не старше `since` (если задан).
   */
  isFresh(url: string, now: Date, since?: Date): boolean {
    const e = this.entry(url);
    if (!e || e.status !== 200 || !existsSync(join(this.dir, e.file))) return false;
    const fetched = new Date(e.fetchedAt);
    if (since && fetched < since) return false;
    return now.getTime() - fetched.getTime() < FRESH_DAYS * 24 * 3600 * 1000;
  }

  read(url: string): string | null {
    const e = this.entry(url);
    if (!e) return null;
    const p = join(this.dir, e.file);
    return existsSync(p) ? readFileSync(p, 'utf8') : null;
  }

  store(meta: Omit<ManifestEntry, 'file' | 'sha256'>, html: string): ManifestEntry {
    const file = cacheFileFor(meta);
    const p = join(this.dir, file);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, html);
    const entry: ManifestEntry = { ...meta, file, sha256: sha256(html) };
    this.manifest.entries[meta.url] = entry;
    return entry;
  }

  update(url: string, patch: Partial<ManifestEntry>) {
    const e = this.entry(url);
    if (e) Object.assign(e, patch);
  }

  entries(filter?: (e: ManifestEntry) => boolean): ManifestEntry[] {
    return Object.values(this.manifest.entries)
      .filter((e) => !filter || filter(e))
      .sort((a, b) => a.url.localeCompare(b.url));
  }

  save() {
    mkdirSync(this.dir, { recursive: true });
    const sorted: Manifest = {
      version: 1,
      entries: Object.fromEntries(Object.entries(this.manifest.entries).sort(([a], [b]) => a.localeCompare(b))),
    };
    writeFileSync(join(this.dir, 'manifest.json'), `${JSON.stringify(sorted, null, 2)}\n`);
  }
}
