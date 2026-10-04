import type { Browser, BrowserContext } from 'playwright-core';
import { EnvHttpProxyAgent, fetch, type Dispatcher } from 'undici';
import { CookieJar } from 'tough-cookie';
import { parseRobots, type RobotsRules } from './robots';
import { DNDSU_BASE } from './sections';

export type TransportResponse = { status: number; body: string; finalUrl: string };
export type FetchResult = TransportResponse & { via: Transport['name'] };

export interface Transport {
  readonly name: 'http' | 'playwright' | 'fake';
  get(url: string): Promise<TransportResponse>;
  close?(): Promise<void>;
}

export class RedirectLoopError extends Error {
  constructor(readonly url: string, readonly chain: string[]) {
    super(`Цикл редиректов: ${chain.join(' → ')}`);
  }
}

export class RobotsDisallowedError extends Error {
  constructor(readonly url: string) {
    super(`robots.txt запрещает ${url}`);
  }
}

export class HttpStatusError extends Error {
  constructor(readonly url: string, readonly status: number) {
    super(`HTTP ${status}: ${url}`);
  }
}

export function userAgent(): string {
  const contact = process.env.IMPORTER_CONTACT?.replace(/[^\x20-\x7e]/g, '') || 'no-contact';
  return `PartySheetImporter/1.0 (+${contact})`;
}

const REDIRECT = new Set([301, 302, 303, 307, 308]);
const MAX_HOPS = 10;

/** undici + cookie-jar (SPEC §7.4); редиректы вручную, чтобы сохранять cookies и ловить циклы. */
export class HttpTransport implements Transport {
  readonly name = 'http' as const;
  readonly jar = new CookieJar();
  private readonly dispatcher: Dispatcher = new EnvHttpProxyAgent();

  async get(url: string): Promise<TransportResponse> {
    const chain: string[] = [];
    const seen = new Set<string>();
    let current = url;
    for (let hop = 0; hop <= MAX_HOPS; hop++) {
      const cookie = await this.jar.getCookieString(current);
      const state = `${current}\n${cookie}`;
      if (seen.has(state)) throw new RedirectLoopError(url, [...chain, current]);
      seen.add(state);
      chain.push(current);
      const res = await fetch(current, {
        redirect: 'manual',
        dispatcher: this.dispatcher,
        headers: {
          'User-Agent': userAgent(),
          'Accept-Language': 'ru',
          Accept: 'text/html,application/xhtml+xml',
          ...(cookie ? { Cookie: cookie } : {}),
        },
      });
      for (const c of res.headers.getSetCookie()) await this.jar.setCookie(c, current, { ignoreError: true });
      if (REDIRECT.has(res.status)) {
        const loc = res.headers.get('location');
        await res.body?.cancel();
        if (!loc) return { status: res.status, body: '', finalUrl: current };
        current = new URL(loc, current).toString();
        continue;
      }
      return { status: res.status, body: await res.text(), finalUrl: current };
    }
    throw new RedirectLoopError(url, chain);
  }

  async close() {
    await this.dispatcher.close();
  }
}

/** Запасной транспорт: headless Chromium через playwright-core (проходит клиентские проверки). */
export class PlaywrightTransport implements Transport {
  readonly name = 'playwright' as const;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  private async page() {
    if (!this.context) {
      const { chromium } = await import('playwright-core');
      this.browser = await chromium.launch({
        executablePath: process.env.IMPORTER_CHROMIUM_PATH || undefined,
        proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined,
      });
      this.context = await this.browser.newContext({ userAgent: userAgent(), locale: 'ru-RU' });
    }
    return this.context.newPage();
  }

  async get(url: string): Promise<TransportResponse> {
    const page = await this.page();
    try {
      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      return { status: res?.status() ?? 0, body: await page.content(), finalUrl: page.url() };
    } finally {
      await page.close();
    }
  }

  async close() {
    await this.context?.close();
    await this.browser?.close();
  }
}

export type ClientOptions = {
  /** Пауза между запросами, мс (SPEC §7.4: 1500 ± 500). */
  delayMs?: number;
  jitterMs?: number;
  /** Попыток на 429/5xx/сетевые ошибки. */
  maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  log?: (msg: string) => void;
  /** Создаёт запасной транспорт при цикле редиректов. */
  fallback?: () => Transport;
  /** Не проверять robots.txt (только для тестов). */
  ignoreRobots?: boolean;
};

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Вежливый клиент: строго по одному запросу, пауза между запросами, robots.txt,
 * экспоненциальная пауза на 429/5xx (до 5 попыток), переход на Playwright при цикле редиректов.
 */
export class PoliteClient {
  private transport: Transport;
  private readonly opts: Required<Omit<ClientOptions, 'fallback'>> & Pick<ClientOptions, 'fallback'>;
  private robots: RobotsRules | null = null;
  private requests = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private spare: Transport | null = null;

  constructor(transport: Transport, opts: ClientOptions = {}) {
    this.transport = transport;
    this.opts = {
      delayMs: opts.delayMs ?? 1500,
      jitterMs: opts.jitterMs ?? 500,
      maxAttempts: opts.maxAttempts ?? 5,
      sleep: opts.sleep ?? realSleep,
      random: opts.random ?? Math.random,
      log: opts.log ?? (() => {}),
      ignoreRobots: opts.ignoreRobots ?? false,
      fallback: opts.fallback,
    };
  }

  get requestCount() {
    return this.requests;
  }

  get transportName() {
    return this.transport.name;
  }

  /** Все запросы последовательны, даже если вызывающий код не ждёт предыдущий. */
  get(url: string): Promise<FetchResult> {
    const run = this.queue.then(() => this.doGet(url));
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Принудительно взять страницу запасным транспортом (список без ссылок, SPEC §7.4). */
  getWithFallback(url: string): Promise<FetchResult> {
    const run = this.queue.then(async () => {
      if (!this.opts.fallback || this.transport.name === 'playwright') return this.doGet(url);
      this.spare ??= this.opts.fallback();
      return this.request(this.spare, url);
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async ensureRobots() {
    if (this.robots || this.opts.ignoreRobots) return;
    try {
      const res = await this.request(this.transport, `${DNDSU_BASE}/robots.txt`);
      this.robots = parseRobots(res.status === 200 ? res.body : '', userAgent());
    } catch (e) {
      if (e instanceof HttpStatusError) this.robots = parseRobots('', userAgent());
      else throw e;
    }
    if (this.robots.crawlDelayMs && this.robots.crawlDelayMs > this.opts.delayMs) {
      this.opts.delayMs = this.robots.crawlDelayMs;
    }
  }

  private async doGet(url: string): Promise<FetchResult> {
    await this.ensureRobots();
    if (this.robots && !this.robots.isAllowed(new URL(url).pathname)) throw new RobotsDisallowedError(url);
    try {
      return await this.request(this.transport, url);
    } catch (e) {
      if (e instanceof RedirectLoopError && this.opts.fallback && this.transport.name !== 'playwright') {
        this.opts.log(`${e.message}; переключаюсь на Playwright`);
        this.transport = this.spare ?? this.opts.fallback();
        this.spare = null;
        return this.request(this.transport, url);
      }
      throw e;
    }
  }

  private async pause() {
    if (this.requests === 0) return;
    const jitter = (this.opts.random() * 2 - 1) * this.opts.jitterMs;
    await this.opts.sleep(Math.max(0, Math.round(this.opts.delayMs + jitter)));
  }

  private async request(transport: Transport, url: string): Promise<FetchResult> {
    let lastError: unknown;
    for (let attempt = 0; attempt < this.opts.maxAttempts; attempt++) {
      if (attempt > 0) await this.opts.sleep(1000 * 2 ** attempt);
      await this.pause();
      this.requests++;
      try {
        const res = await transport.get(url);
        if (res.status === 429 || res.status >= 500) {
          lastError = new HttpStatusError(url, res.status);
          this.opts.log(`HTTP ${res.status} ${url}, попытка ${attempt + 1}/${this.opts.maxAttempts}`);
          continue;
        }
        if (res.status >= 400) throw new HttpStatusError(url, res.status);
        return { ...res, via: transport.name };
      } catch (e) {
        if (e instanceof HttpStatusError || e instanceof RedirectLoopError) throw e;
        lastError = e;
        this.opts.log(`Ошибка сети ${url}: ${(e as Error).message}, попытка ${attempt + 1}/${this.opts.maxAttempts}`);
      }
    }
    throw lastError;
  }

  async close() {
    await this.transport.close?.();
    await this.spare?.close?.();
  }
}
