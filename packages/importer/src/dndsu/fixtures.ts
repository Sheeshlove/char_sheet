import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CrawlCache } from './cache';
import { importerRoot } from './cache';
import { extractEntityLinks, type PageGetter } from './crawl';
import { parseRecord, type ParsedRecord } from './parse/record';
import { DNDSU_BASE, listUrl, parseEntityUrl, SECTIONS, type EntityUrl, type Section } from './sections';

export function fixturesDir(): string {
  return process.env.DNDSU_FIXTURES_DIR ?? join(importerRoot(), 'fixtures');
}

/**
 * Образцы страниц (SPEC §7.3): минимум по 3 на тип, включая «трудные».
 * Страницы ищутся на странице-списке по английскому slug; прямые URL — из SPEC.
 */
export const FIXTURE_PLAN: Record<Section, { urls?: string[]; slugs: RegExp[]; subpagesOf?: RegExp[] }> = {
  classes: {
    urls: [`${DNDSU_BASE}/class/87-barbarian/`],
    slugs: [/^wizard$/, /^warlock$/, /^fighter$/],
    // Подкласс с заклинаниями (Мистический рыцарь) и домен жреца — со страниц воина и жреца.
    subpagesOf: [/^fighter$/, /^cleric$/],
  },
  races: { urls: [`${DNDSU_BASE}/race/78-dwarf/`], slugs: [/^half-?orc$/, /^(aasimar|tabaxi|firbolg|goliath)$/] },
  spells: {
    urls: [`${DNDSU_BASE}/spells/205-fireball/`],
    slugs: [/^detect-magic$/, /^fire-bolt$/, /^(raise-dead|resurrection)$/],
  },
  backgrounds: { slugs: [/^acolyte$/, /^sage$/, /^criminal$/] },
  feats: { slugs: [/^alert$/, /^war-caster$/, /^great-weapon-master$/] },
  items: { slugs: [/^staff-of-power$/, /^wand-of-magic-missiles$/, /^(flame-tongue|vorpal-sword)$/] },
};

export const HOMEBREW_FIXTURES = [`${DNDSU_BASE}/homebrew/class/853-alternate-barbarian/`];

function fixtureName(e: EntityUrl) {
  return `${e.externalId}-${e.slug}`;
}

/** Скачивает образцы в `fixtures/<section>/` (через кэш и вежливый клиент). */
export async function downloadFixtures(client: PageGetter, cache: CrawlCache, log: (m: string) => void) {
  const dir = fixturesDir();
  const save = (section: string, name: string, html: string) => {
    mkdirSync(join(dir, section), { recursive: true });
    writeFileSync(join(dir, section, `${name}.html`), html);
    log(`✓ fixtures/${section}/${name}.html`);
  };
  const get = async (url: string) => {
    const cached = cache.read(url);
    if (cached) return cached;
    return (await client.get(url)).body;
  };
  for (const section of SECTIONS) {
    const plan = FIXTURE_PLAN[section];
    const lurl = listUrl(section, false);
    const listHtml = await get(lurl);
    save(section, '_list', listHtml);
    const links = extractEntityLinks(listHtml, lurl, section, false);
    const targets = new Map<string, EntityUrl>();
    for (const u of plan.urls ?? []) {
      const e = parseEntityUrl(u);
      if (e) targets.set(e.url, e);
    }
    for (const re of plan.slugs) {
      const e = links.find((l) => re.test(l.slug));
      if (e) targets.set(e.url, e);
      else log(`! ${section}: в списке нет страницы ${re}`);
    }
    for (const e of targets.values()) save(section, fixtureName(e), await get(e.url));
    for (const re of plan.subpagesOf ?? []) {
      const parent = links.find((l) => re.test(l.slug));
      if (!parent) continue;
      const html = await get(parent.url);
      const sub = extractEntityLinks(html, parent.url, section, false).find((l) => !links.some((x) => x.url === l.url));
      if (sub) save(section, `${fixtureName(sub)}.sub-of-${fixtureName(parent)}`, await get(sub.url));
    }
  }
  for (const u of HOMEBREW_FIXTURES) {
    const e = parseEntityUrl(u)!;
    save(`homebrew-${e.section}`, fixtureName(e), await get(e.url));
  }
}

export type Fixture = { section: Section; homebrew: boolean; file: string; html: string; expectedPath: string; meta: EntityUrl & { parentUrl?: string } };

/** Все образцы страниц сущностей (без страниц-списков). */
export function listFixtures(): Fixture[] {
  const dir = fixturesDir();
  if (!existsSync(dir)) return [];
  const out: Fixture[] = [];
  for (const sub of readdirSync(dir)) {
    const homebrew = sub.startsWith('homebrew-');
    const sectionName = homebrew ? sub.slice('homebrew-'.length) : sub;
    const section = (SECTIONS as readonly string[]).includes(sectionName) ? (sectionName as Section) : null;
    if (!section) continue;
    for (const f of readdirSync(join(dir, sub))) {
      if (!f.endsWith('.html') || f.startsWith('_')) continue;
      const m = /^(\d+)-([a-z0-9_-]+?)(?:\.sub-of-(\d+-[a-z0-9_-]+))?\.html$/.exec(f);
      if (!m) continue;
      const path = `${homebrew ? 'homebrew/' : ''}${section === 'classes' ? 'class' : section === 'races' ? 'race' : section}`;
      const meta = parseEntityUrl(`${DNDSU_BASE}/${path}/${m[1]}-${m[2]}/`);
      if (!meta) continue;
      out.push({
        section,
        homebrew,
        file: join(dir, sub, f),
        html: readFileSync(join(dir, sub, f), 'utf8'),
        expectedPath: join(dir, sub, f.replace(/\.html$/, '.expected.json')),
        meta: m[3] ? { ...meta, parentUrl: `${DNDSU_BASE}/${path}/${m[3]}/` } : meta,
      });
    }
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

export function parseFixture(f: Fixture): ParsedRecord {
  return parseRecord(f.html, { ...f.meta, section: f.section, homebrew: f.homebrew });
}

export type FixtureStatus = { section: Section; verified: number; failing: string[]; unverified: string[] };

/**
 * Проверка парсеров на образцах: секция считается проверенной, если есть ≥ 3 образца
 * с `*.expected.json` (просмотрены человеком) и все совпадают (SPEC §7.3, §7.5).
 */
export function fixtureStatus(): Record<Section, FixtureStatus> {
  const out = Object.fromEntries(
    SECTIONS.map((s): [Section, FixtureStatus] => [s, { section: s, verified: 0, failing: [], unverified: [] }]),
  ) as Record<Section, FixtureStatus>;
  for (const f of listFixtures()) {
    const st = out[f.section];
    if (!existsSync(f.expectedPath)) {
      st.unverified.push(f.file);
      continue;
    }
    const expected = JSON.parse(readFileSync(f.expectedPath, 'utf8'));
    const actual = JSON.parse(JSON.stringify(parseFixture(f)));
    if (JSON.stringify(actual) === JSON.stringify(expected)) st.verified++;
    else st.failing.push(f.file);
  }
  return out;
}

export function isSectionVerified(s: FixtureStatus): boolean {
  return s.verified >= 3 && s.failing.length === 0;
}

/** Черновики `*.expected.json` для ручной проверки (существующие не перезаписываются). */
export function writeExpectedDrafts(log: (m: string) => void) {
  for (const f of listFixtures()) {
    const draft = f.expectedPath.replace(/\.expected\.json$/, '.draft.json');
    if (existsSync(f.expectedPath)) continue;
    writeFileSync(draft, `${JSON.stringify(parseFixture(f), null, 2)}\n`);
    log(`черновик ${draft} — проверьте и переименуйте в .expected.json`);
  }
}
