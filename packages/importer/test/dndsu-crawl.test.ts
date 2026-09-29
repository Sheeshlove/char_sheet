import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CrawlCache } from '../src/dndsu/cache';
import { crawl, extractEntityLinks } from '../src/dndsu/crawl';
import {
  HttpStatusError,
  PoliteClient,
  RedirectLoopError,
  RobotsDisallowedError,
  type Transport,
  type TransportResponse,
} from '../src/dndsu/http';
import { KeyMap } from '../src/dndsu/key-map';

type Handler = (url: string) => TransportResponse | Error;

class FakeTransport implements Transport {
  readonly name: Transport['name'];
  calls: string[] = [];
  constructor(
    private handler: Handler,
    name: Transport['name'] = 'fake',
  ) {
    this.name = name;
  }
  async get(url: string) {
    this.calls.push(url);
    const r = this.handler(url);
    if (r instanceof Error) throw r;
    return r;
  }
}

const ok = (body: string, url = ''): TransportResponse => ({ status: 200, body, finalUrl: url });

function recorder() {
  const sleeps: number[] = [];
  return { sleeps, sleep: async (ms: number) => void sleeps.push(ms) };
}

describe('PoliteClient', () => {
  it('пауза 1500 ± 500 мс между запросами, первый — без паузы', async () => {
    const t = new FakeTransport((u) => ok(u));
    const { sleeps, sleep } = recorder();
    let i = 0;
    const rnd = [0, 1, 0.5];
    const c = new PoliteClient(t, { sleep, random: () => rnd[i++ % 3]!, ignoreRobots: true });
    await c.get('https://dnd.su/a/');
    await c.get('https://dnd.su/b/');
    await c.get('https://dnd.su/c/');
    await c.get('https://dnd.su/d/');
    expect(sleeps).toEqual([1000, 2000, 1500]);
    expect(c.requestCount).toBe(4);
  });

  it('запросы строго последовательны', async () => {
    let active = 0;
    let maxActive = 0;
    const t: Transport = {
      name: 'fake',
      async get(url) {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
        return ok(url);
      },
    };
    const c = new PoliteClient(t, { sleep: async () => {}, ignoreRobots: true });
    await Promise.all(['a', 'b', 'c'].map((x) => c.get(`https://dnd.su/${x}/`)));
    expect(maxActive).toBe(1);
  });

  it('429/5xx — экспоненциальная пауза и повтор, 4xx — сразу ошибка', async () => {
    let n = 0;
    const t = new FakeTransport(() => (++n < 3 ? { status: n === 1 ? 429 : 503, body: '', finalUrl: '' } : ok('готово')));
    const { sleeps, sleep } = recorder();
    const c = new PoliteClient(t, { sleep, random: () => 0.5, ignoreRobots: true });
    expect((await c.get('https://dnd.su/x/')).body).toBe('готово');
    expect(sleeps).toEqual([2000, 1500, 4000, 1500]);

    const nf = new PoliteClient(new FakeTransport(() => ({ status: 404, body: '', finalUrl: '' })), { sleep, ignoreRobots: true });
    await expect(nf.get('https://dnd.su/404/')).rejects.toBeInstanceOf(HttpStatusError);

    const always = new FakeTransport(() => ({ status: 500, body: '', finalUrl: '' }));
    const c2 = new PoliteClient(always, { sleep, ignoreRobots: true });
    await expect(c2.get('https://dnd.su/500/')).rejects.toBeInstanceOf(HttpStatusError);
    expect(always.calls).toHaveLength(5);
  });

  it('цикл редиректов → запасной транспорт (Playwright) для этого и следующих запросов', async () => {
    const http = new FakeTransport((u) => new RedirectLoopError(u, [u, u]), 'http');
    const pw = new FakeTransport((u) => ok(`pw:${u}`), 'playwright');
    const c = new PoliteClient(http, { sleep: async () => {}, ignoreRobots: true, fallback: () => pw });
    const r = await c.get('https://dnd.su/a/');
    expect(r).toMatchObject({ body: 'pw:https://dnd.su/a/', via: 'playwright' });
    await c.get('https://dnd.su/b/');
    expect(http.calls).toEqual(['https://dnd.su/a/']);
    expect(pw.calls).toEqual(['https://dnd.su/a/', 'https://dnd.su/b/']);
  });

  it('уважает robots.txt', async () => {
    const t = new FakeTransport((u) => (u.endsWith('/robots.txt') ? ok('User-agent: *\nDisallow: /homebrew/\n') : ok(u)));
    const c = new PoliteClient(t, { sleep: async () => {} });
    await expect(c.get('https://dnd.su/homebrew/class/853-alternate-barbarian/')).rejects.toBeInstanceOf(RobotsDisallowedError);
    expect((await c.get('https://dnd.su/class/87-barbarian/')).status).toBe(200);
    expect(t.calls.filter((u) => u.endsWith('robots.txt'))).toHaveLength(1);
  });
});

describe('crawl', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'dndsu-cache-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const pages: Record<string, string> = {
    'https://dnd.su/class/': `<a href="/class/87-barbarian/">Варвар</a><a href="/class/88-fighter/">Воин</a><a href="/spells/1-x/">не класс</a><a href="/class/87-barbarian/">дубль</a>`,
    'https://dnd.su/class/87-barbarian/': `<h2>Варвар [Barbarian]</h2><a href="/class/88-fighter/">Воин</a>`,
    'https://dnd.su/class/88-fighter/': `<h2>Воин [Fighter]</h2><a href="/class/200-eldritch-knight/">Мистический рыцарь</a>`,
    'https://dnd.su/class/200-eldritch-knight/': `<h2>Мистический рыцарь [Eldritch Knight]</h2>`,
  };

  function getter() {
    const calls: string[] = [];
    return {
      calls,
      async get(url: string) {
        calls.push(url);
        const body = pages[url];
        if (body === undefined) throw new HttpStatusError(url, 404);
        return { status: 200, body, finalUrl: url, via: 'fake' as const };
      },
      async getWithFallback(url: string) {
        return this.get(url);
      },
    };
  }

  it('ссылки секции со страницы-списка (без дублей и чужих секций)', () => {
    expect(extractEntityLinks(pages['https://dnd.su/class/']!, 'https://dnd.su/class/', 'classes', false).map((l) => l.slug)).toEqual([
      'barbarian',
      'fighter',
    ]);
  });

  it('скачивает список, сущности и подклассы; повторный запуск без --force не ходит в сеть', async () => {
    const now = new Date('2026-09-01T00:00:00Z');
    const g = getter();
    const cache = new CrawlCache(dir);
    const [rep] = await crawl(g, cache, { sections: ['classes'], homebrew: false, now: () => now });
    expect(rep).toMatchObject({ listed: 2, subpages: 1, downloaded: 4, fromCache: 0, failed: [] });
    expect(cache.entry('https://dnd.su/class/200-eldritch-knight/')).toMatchObject({
      parentUrl: 'https://dnd.su/class/88-fighter/',
      externalId: 200,
      slug: 'eldritch-knight',
      file: 'classes/200-eldritch-knight.html',
    });
    expect(cache.entry('https://dnd.su/class/')?.linkCount).toBe(2);

    const g2 = getter();
    const later = new Date('2026-09-20T00:00:00Z');
    const [rep2] = await crawl(g2, new CrawlCache(dir), { sections: ['classes'], homebrew: false, now: () => later });
    expect(g2.calls).toEqual([]);
    expect(rep2).toMatchObject({ downloaded: 0, fromCache: 4, subpages: 1 });

    // Старше 30 дней — перекачивается; --force — всегда.
    const g3 = getter();
    await crawl(g3, new CrawlCache(dir), { sections: ['classes'], homebrew: false, now: () => new Date('2026-10-05T00:00:00Z') });
    expect(g3.calls).toHaveLength(4);
    const g4 = getter();
    await crawl(g4, new CrawlCache(dir), { sections: ['classes'], homebrew: false, force: true, now: () => later });
    expect(g4.calls).toHaveLength(4);
  });

  it('--since перекачивает страницы, скачанные раньше даты; --limit ограничивает число сущностей', async () => {
    const g = getter();
    await crawl(g, new CrawlCache(dir), { sections: ['classes'], homebrew: false, now: () => new Date('2026-09-01T00:00:00Z') });
    const g2 = getter();
    await crawl(g2, new CrawlCache(dir), {
      sections: ['classes'],
      homebrew: false,
      since: new Date('2026-09-02T00:00:00Z'),
      now: () => new Date('2026-09-03T00:00:00Z'),
    });
    expect(g2.calls).toHaveLength(4);

    const d2 = mkdtempSync(join(tmpdir(), 'dndsu-cache-'));
    const g3 = getter();
    const [rep] = await crawl(g3, new CrawlCache(d2), { sections: ['classes'], homebrew: false, limit: 1 });
    expect(rep!.listed).toBe(2);
    expect(g3.calls).toEqual(['https://dnd.su/class/', 'https://dnd.su/class/87-barbarian/']);
    rmSync(d2, { recursive: true, force: true });
  });

  it('ошибки страниц попадают в отчёт, crawl продолжается', async () => {
    const g = getter();
    delete pages['https://dnd.su/class/200-eldritch-knight/'];
    const [rep] = await crawl(g, new CrawlCache(dir), { sections: ['classes'], homebrew: false });
    expect(rep!.failed).toEqual([{ url: 'https://dnd.su/class/200-eldritch-knight/', error: 'HTTP 404: https://dnd.su/class/200-eldritch-knight/' }]);
    expect(rep!.downloaded).toBe(3);
  });
});

describe('key-map', () => {
  it('ключи стабильны и не меняются при смене slug', () => {
    const km = new KeyMap();
    expect(km.entityKey('spells/205', 'dndsu-official', 'spell', 'fireball', 205)).toBe('dndsu-official/spell/fireball');
    expect(km.entityKey('spells/205', 'dndsu-official', 'spell', 'fire-ball-renamed', 205)).toBe('dndsu-official/spell/fireball');
    const reloaded = new KeyMap(JSON.parse(JSON.stringify(km.data)));
    expect(reloaded.entityKey('spells/205', 'dndsu-official', 'spell', 'другое', 205)).toBe('dndsu-official/spell/fireball');
    expect(reloaded.changed).toBe(false);
  });

  it('повтор slug в пакете и виде → slug-<externalId>', () => {
    const km = new KeyMap();
    expect(km.entityKey('homebrew/class/10', 'dndsu-homebrew', 'class', 'witch', 10)).toBe('dndsu-homebrew/class/witch');
    expect(km.entityKey('homebrew/class/11', 'dndsu-homebrew', 'class', 'witch', 11)).toBe('dndsu-homebrew/class/witch-11');
    expect(km.entityKey('class/12', 'dndsu-official', 'class', 'witch', 12)).toBe('dndsu-official/class/witch');
    expect(km.changed).toBe(true);
  });

  it('ключи умений уникальны в пределах сущности и фиксируются', () => {
    const km = new KeyMap();
    expect(km.featureKey('p/class/x', 'Ярость', 'rage')).toBe('rage');
    expect(km.featureKey('p/class/x', 'Ярость (улучшенная)', 'rage')).toBe('rage-2');
    expect(km.featureKey('p/class/x', 'Ярость', 'something-else')).toBe('rage');
    expect(km.featureKey('p/class/y', 'Ярость', 'rage')).toBe('rage');
  });
});
