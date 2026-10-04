/**
 * `pnpm import:dndsu <fixtures|crawl|parse|build|diff>` — импорт dnd.su (SPEC §7.2–7.6).
 *
 *   fixtures [--drafts]             образцы страниц в fixtures/ (SPEC §7.3); --drafts — черновики expected.json
 *   crawl  [--section s] [--homebrew] [--since ISO] [--limit N] [--force]
 *   parse  [--section s] [--homebrew]  cache/*.html → parsed/*.json (только для проверенных на образцах секций)
 *   build                           parsed + словари + оверлеи → content-data/dndsu/{official,homebrew}
 *   diff                            отчёт без записи пакетов
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { contentDataDir, readPack } from '@ps/content-data';
import { buildDndsu } from '../dndsu/build';
import { CrawlCache, importerRoot } from '../dndsu/cache';
import { crawl } from '../dndsu/crawl';
import { downloadFixtures, fixtureStatus, isSectionVerified, writeExpectedDrafts } from '../dndsu/fixtures';
import { HttpTransport, PlaywrightTransport, PoliteClient } from '../dndsu/http';
import { KeyMap } from '../dndsu/key-map';
import { parseRecord, type ParsedRecord } from '../dndsu/parse/record';
import { diffPacks, packDir, renderReport } from '../dndsu/report';
import { isSection, PACK_HOMEBREW, PACK_OFFICIAL, SECTIONS, type Section } from '../dndsu/sections';
import { loadOverlays } from '../overlays';
import { writePack } from '../pack-writer';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    section: { type: 'string', multiple: true },
    homebrew: { type: 'boolean', default: false },
    since: { type: 'string' },
    limit: { type: 'string' },
    force: { type: 'boolean', default: false },
    drafts: { type: 'boolean', default: false },
  },
});

const command = positionals[0];
const log = (m: string) => console.log(m);

function sections(): Section[] {
  const list = values.section?.flatMap((s) => s.split(',')) ?? [...SECTIONS];
  for (const s of list) {
    if (!isSection(s)) {
      console.error(`Неизвестная секция «${s}». Допустимые: ${SECTIONS.join(', ')}`);
      process.exit(2);
    }
  }
  return list as Section[];
}

function client() {
  return new PoliteClient(new HttpTransport(), { log, fallback: () => new PlaywrightTransport() });
}

const parsedDir = () => process.env.DNDSU_PARSED_DIR ?? join(importerRoot(), 'parsed');

function readParsed(): ParsedRecord[] {
  const root = parsedDir();
  if (!existsSync(root)) return [];
  const out: ParsedRecord[] = [];
  const walk = (dir: string) => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      if (d.isDirectory()) walk(join(dir, d.name));
      else if (d.name.endsWith('.json')) out.push(JSON.parse(readFileSync(join(dir, d.name), 'utf8')) as ParsedRecord);
    }
  };
  walk(root);
  return out;
}

function runBuild() {
  const keyMap = KeyMap.load();
  const srdDir = join(contentDataDir(), 'srd');
  const srd = existsSync(join(srdDir, 'pack.json')) ? readPack(srdDir).entities : [];
  const records = readParsed();
  if (!records.length) console.warn('Нет разобранных страниц (parsed/). Сначала crawl и parse.');
  const result = buildDndsu({
    records,
    keyMap,
    srd,
    overlays: { [PACK_OFFICIAL]: loadOverlays(PACK_OFFICIAL), [PACK_HOMEBREW]: loadOverlays(PACK_HOMEBREW) },
  });
  return { result, keyMap };
}

function writeReport(text: string) {
  const path = join(importerRoot(), '..', '..', 'docs', 'dndsu-import-report.md');
  writeFileSync(path, text);
  log(`Отчёт: docs/dndsu-import-report.md`);
}

async function main() {
  switch (command) {
    case 'fixtures': {
      if (values.drafts) {
        writeExpectedDrafts(log);
        break;
      }
      const c = client();
      try {
        await downloadFixtures(c, new CrawlCache(), log);
      } finally {
        await c.close();
      }
      log('Теперь: pnpm import:dndsu fixtures --drafts, проверьте черновики и сохраните как *.expected.json');
      break;
    }
    case 'crawl': {
      const c = client();
      const cache = new CrawlCache();
      try {
        const reports = await crawl(c, cache, {
          sections: sections(),
          homebrew: values.homebrew,
          since: values.since ? new Date(values.since) : undefined,
          limit: values.limit ? Number(values.limit) : undefined,
          force: values.force,
          log,
        });
        for (const r of reports) {
          log(
            `${r.homebrew ? 'homebrew/' : ''}${r.section}: в списке ${r.listed}, подстраниц ${r.subpages}, скачано ${r.downloaded}, из кэша ${r.fromCache}, ошибок ${r.failed.length}`,
          );
        }
        log(`Сетевых запросов: ${c.requestCount}`);
      } finally {
        cache.save();
        await c.close();
      }
      break;
    }
    case 'parse': {
      const status = fixtureStatus();
      const cache = new CrawlCache();
      let blocked = false;
      for (const s of sections()) {
        const st = status[s];
        if (!isSectionVerified(st)) {
          blocked = true;
          console.error(
            `Секция ${s}: парсер не проверен на образцах (проверено ${st.verified}, расхождений ${st.failing.length}, без expected.json ${st.unverified.length}). ` +
              'SPEC §7.3: сначала pnpm import:dndsu fixtures и проверенные *.expected.json.',
          );
          continue;
        }
        const entries = cache.entries((e) => e.type === 'entity' && e.section === s && e.homebrew === values.homebrew && e.status === 200);
        const outDir = join(parsedDir(), values.homebrew ? 'homebrew' : 'official', s);
        rmSync(outDir, { recursive: true, force: true });
        mkdirSync(outDir, { recursive: true });
        for (const e of entries) {
          const html = cache.read(e.url);
          if (!html) continue;
          const rec = parseRecord(html, {
            url: e.url,
            section: s,
            homebrew: e.homebrew,
            externalId: e.externalId!,
            parentUrl: e.parentUrl,
          });
          writeFileSync(join(outDir, `${e.externalId}-${e.slug}.json`), `${JSON.stringify(rec, null, 2)}\n`);
        }
        log(`${s}: разобрано ${entries.length}`);
      }
      if (blocked) process.exitCode = 1;
      break;
    }
    case 'build': {
      const { result, keyMap } = runBuild();
      const diff = diffPacks(result.packs);
      for (const [pack, entities] of Object.entries(result.packs)) {
        if (!entities.length) continue;
        const res = writePack(
          packDir(pack),
          {
            key: pack,
            name: pack === PACK_OFFICIAL ? 'dnd.su — официальные материалы' : 'dnd.su — homebrew',
            sourceType: 'dndsu',
            source: 'https://dnd.su',
          },
          entities,
        );
        for (const e of res.errors) console.error(e);
        if (res.errors.length) process.exitCode = 1;
        log(`${pack}: ${entities.length} сущностей, версия ${res.manifest.version.slice(0, 12)}…`);
      }
      if (keyMap.changed) keyMap.save();
      writeReport(renderReport(result, diff, new CrawlCache()));
      break;
    }
    case 'diff': {
      const { result } = runBuild();
      const diff = diffPacks(result.packs);
      for (const d of diff) log(`${d.pack}: новых ${d.added.length}, изменённых ${d.changed.length}, пропавших ${d.removed.length}`);
      writeReport(renderReport(result, diff, new CrawlCache()));
      break;
    }
    default:
      console.error('Использование: pnpm import:dndsu <fixtures|crawl|parse|build|diff> [--section s] [--homebrew] [--since ISO] [--limit N] [--force]');
      process.exit(2);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
