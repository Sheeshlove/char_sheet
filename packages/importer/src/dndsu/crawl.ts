import * as cheerio from 'cheerio';
import type { CrawlCache } from './cache';
import type { FetchResult } from './http';
import { listUrl, parseEntityUrl, type EntityUrl, type Section } from './sections';

export type PageGetter = {
  get(url: string): Promise<FetchResult>;
  getWithFallback(url: string): Promise<FetchResult>;
};

export type CrawlOptions = {
  sections: Section[];
  homebrew: boolean;
  /** Перекачать страницы, скачанные раньше этой даты. */
  since?: Date;
  /** Не больше N страниц сущностей на секцию (для проверки). */
  limit?: number;
  /** Игнорировать свежесть кэша. */
  force?: boolean;
  now?: () => Date;
  log?: (msg: string) => void;
};

export type CrawlSectionReport = {
  section: Section;
  homebrew: boolean;
  listUrl: string;
  /** Ссылок на сущности на странице-списке. */
  listed: number;
  /** Дополнительно найдено подклассов на страницах классов. */
  subpages: number;
  downloaded: number;
  fromCache: number;
  failed: { url: string; error: string }[];
};

/** Ссылки на сущности секции в HTML (относительные разрешаются от `pageUrl`). */
export function extractEntityLinks(html: string, pageUrl: string, section: Section, homebrew: boolean): EntityUrl[] {
  const $ = cheerio.load(html);
  const out = new Map<string, EntityUrl>();
  $('a[href]').each((_, el) => {
    const e = parseEntityUrl($(el).attr('href') ?? '', pageUrl);
    if (e && e.section === section && e.homebrew === homebrew && !out.has(e.url)) out.set(e.url, e);
  });
  return [...out.values()];
}

export async function crawl(client: PageGetter, cache: CrawlCache, opts: CrawlOptions): Promise<CrawlSectionReport[]> {
  const now = opts.now ?? (() => new Date());
  const log = opts.log ?? (() => {});
  const reports: CrawlSectionReport[] = [];

  async function page(
    url: string,
    meta: { section: Section; homebrew: boolean; type: 'list' | 'entity'; externalId?: number; slug?: string; parentUrl?: string },
    report: CrawlSectionReport,
  ): Promise<string | null> {
    if (!opts.force && cache.isFresh(url, now(), opts.since)) {
      report.fromCache++;
      if (meta.parentUrl) cache.update(url, { parentUrl: meta.parentUrl });
      return cache.read(url);
    }
    try {
      const res = await client.get(url);
      cache.store({ ...meta, url, fetchedAt: now().toISOString(), status: res.status, via: res.via }, res.body);
      cache.save();
      report.downloaded++;
      log(`↓ ${url} (${res.via})`);
      return res.body;
    } catch (e) {
      report.failed.push({ url, error: (e as Error).message });
      log(`✗ ${url}: ${(e as Error).message}`);
      return null;
    }
  }

  for (const section of opts.sections) {
    const lurl = listUrl(section, opts.homebrew);
    const report: CrawlSectionReport = {
      section,
      homebrew: opts.homebrew,
      listUrl: lurl,
      listed: 0,
      subpages: 0,
      downloaded: 0,
      fromCache: 0,
      failed: [],
    };
    reports.push(report);
    let listHtml = await page(lurl, { section, homebrew: opts.homebrew, type: 'list' }, report);
    if (listHtml === null) continue;
    let links = extractEntityLinks(listHtml, lurl, section, opts.homebrew);
    if (!links.length) {
      // Список рендерится скриптом: берём страницу через Playwright (SPEC §7.4).
      log(`В списке ${lurl} нет ссылок — пробую Playwright`);
      try {
        const res = await client.getWithFallback(lurl);
        cache.store(
          { section, homebrew: opts.homebrew, type: 'list', url: lurl, fetchedAt: now().toISOString(), status: res.status, via: res.via },
          res.body,
        );
        listHtml = res.body;
        links = extractEntityLinks(listHtml, lurl, section, opts.homebrew);
      } catch (e) {
        report.failed.push({ url: lurl, error: (e as Error).message });
      }
    }
    report.listed = links.length;
    cache.update(lurl, { linkCount: links.length });
    cache.save();

    const listed = new Set(links.map((l) => l.url));
    const queue = opts.limit !== undefined ? links.slice(0, opts.limit) : links;
    for (const link of queue) {
      const html = await page(
        link.url,
        { section, homebrew: opts.homebrew, type: 'entity', externalId: link.externalId, slug: link.slug },
        report,
      );
      if (html === null || section !== 'classes') continue;
      // Подклассы: ссылки на страницы того же раздела, которых нет в списке классов.
      const subs = extractEntityLinks(html, link.url, section, opts.homebrew).filter((s) => !listed.has(s.url));
      for (const sub of subs) {
        listed.add(sub.url);
        report.subpages++;
        await page(
          sub.url,
          {
            section,
            homebrew: opts.homebrew,
            type: 'entity',
            externalId: sub.externalId,
            slug: sub.slug,
            parentUrl: link.url,
          },
          report,
        );
      }
    }
    cache.save();
  }
  return reports;
}
