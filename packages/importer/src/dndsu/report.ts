import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { contentDataDir, readPack } from '@ps/content-data';
import type { ContentEntity } from '@ps/content-schema';
import type { BuildResult } from './build';
import type { CrawlCache } from './cache';
import { PACK_HOMEBREW, PACK_OFFICIAL, SECTIONS } from './sections';
import { stableStringify } from '../util/json';

export const PACK_DIRS: Record<string, string> = {
  [PACK_OFFICIAL]: join('dndsu', 'official'),
  [PACK_HOMEBREW]: join('dndsu', 'homebrew'),
};

export function packDir(pack: string): string {
  return join(contentDataDir(), PACK_DIRS[pack]!);
}

export function readExistingPack(pack: string): ContentEntity[] {
  const dir = packDir(pack);
  return existsSync(join(dir, 'pack.json')) ? readPack(dir).entities : [];
}

export type PackDiff = { pack: string; added: string[]; changed: string[]; removed: string[] };

/** Новые / изменённые / пропавшие сущности относительно пакетов в репозитории. */
export function diffPacks(built: Record<string, ContentEntity[]>): PackDiff[] {
  return [PACK_OFFICIAL, PACK_HOMEBREW].map((pack) => {
    const before = new Map(readExistingPack(pack).map((e) => [e.key, stableStringify(e)]));
    const after = new Map((built[pack] ?? []).map((e) => [e.key, stableStringify(e)]));
    const added = [...after.keys()].filter((k) => !before.has(k)).sort();
    const removed = [...before.keys()].filter((k) => !after.has(k)).sort();
    const changed = [...after.keys()].filter((k) => before.has(k) && before.get(k) !== after.get(k)).sort();
    return { pack, added, changed, removed };
  });
}

/** Отчёт импорта: сверка количества со страницами-списками, нераспознанные поля, расхождения с SRD, diff. */
export function renderReport(result: BuildResult, diff: PackDiff[], cache: CrawlCache, generatedAt = new Date()): string {
  const lines: string[] = [
    '# Отчёт импорта dnd.su',
    '',
    `Сгенерирован: ${generatedAt.toISOString()} (\`pnpm import:dndsu build\` / \`diff\`).`,
    '',
    '## Количество: страницы-списки → разобрано → собрано',
    '',
    '| Раздел | На странице-списке | Скачано | Разобрано | Собрано | Расхождение |',
    '| --- | ---: | ---: | ---: | ---: | --- |',
  ];
  for (const homebrew of [false, true]) {
    for (const section of SECTIONS) {
      const k = `${homebrew ? 'homebrew/' : ''}${section}`;
      const list = cache.entries((e) => e.type === 'list' && e.section === section && e.homebrew === homebrew)[0];
      const downloaded = cache.entries(
        (e) => e.type === 'entity' && e.section === section && e.homebrew === homebrew && e.status === 200 && !e.parentUrl,
      ).length;
      const c = result.counts[k];
      if (!list && !c) continue;
      const listed = list?.linkCount ?? 0;
      const parsed = c?.parsed ?? 0;
      const built = c?.built ?? 0;
      const note = listed !== downloaded ? 'не все страницы скачаны' : parsed < downloaded ? 'не все разобраны' : built < parsed ? 'см. «Нераспознанное»' : '—';
      lines.push(`| ${k} | ${listed} | ${downloaded} | ${parsed} | ${built} | ${note} |`);
    }
  }
  lines.push('', '## Нераспознанные поля', '');
  if (!result.problems.length) lines.push('Нет — все структурированные поля распознаны.');
  else {
    lines.push('| Сущность | Поле | Значение |', '| --- | --- | --- |');
    for (const p of result.problems) {
      lines.push(`| [${p.key}](${p.url}) | ${p.field} | ${(p.value ?? '—').replace(/\|/g, '\\|').slice(0, 160)} |`);
    }
  }
  lines.push('', '## Расхождения с SRD и предупреждения', '');
  if (!result.warnings.length) lines.push('Нет.');
  else for (const w of result.warnings) lines.push(`- \`${w.key}\`: ${w.message}`);
  lines.push('', '## Изменения относительно репозитория', '');
  for (const d of diff) {
    lines.push(`### ${d.pack}`, '', `Новых: ${d.added.length}, изменённых: ${d.changed.length}, пропавших: ${d.removed.length}.`, '');
    for (const [title, list] of [
      ['Новые', d.added],
      ['Изменённые', d.changed],
      ['Пропавшие', d.removed],
    ] as const) {
      if (!list.length) continue;
      lines.push(`<details><summary>${title} (${list.length})</summary>`, '', ...list.map((k) => `- \`${k}\``), '', '</details>', '');
    }
  }
  return `${lines.join('\n')}\n`;
}
