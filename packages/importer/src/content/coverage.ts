import type { LoadedPack } from '@ps/content-data';
import { entityFeatures } from './walk';

const KIND_RU: Record<string, string> = {
  race: 'Расы',
  subrace: 'Подрасы',
  class: 'Классы',
  subclass: 'Подклассы',
  background: 'Предыстории',
  feat: 'Черты',
  spell: 'Заклинания',
  item: 'Магические предметы',
  weapon: 'Оружие',
  armor: 'Доспехи',
  gear: 'Снаряжение',
  tool: 'Инструменты',
  language: 'Языки',
  condition: 'Состояния',
  feature: 'Умения',
};

/**
 * Отчёт покрытия: число сущностей complete / partial / text_only по пакетам и видам и
 * список умений без эффектов — рабочий список для следующих оверлеев.
 * `usage` — сколько персонажей используют источник (если доступна БД).
 */
export function coverageMarkdown(packs: LoadedPack[], usage: Map<string, number> = new Map()): string {
  const lines: string[] = ['# Покрытие контента эффектами', '', 'Генерируется `pnpm content:coverage`. Не редактировать вручную.', ''];
  for (const { manifest, entities } of packs) {
    lines.push(`## Пакет \`${manifest.key}\` — ${manifest.name}`, '', '| Вид | Всего | complete | partial | text_only |', '| --- | ---: | ---: | ---: | ---: |');
    const kinds = [...new Set(entities.map((e) => e.kind))].sort();
    for (const k of kinds) {
      const list = entities.filter((e) => e.kind === k);
      const c = (s: string) => list.filter((e) => e.effectsStatus === s).length;
      lines.push(`| ${KIND_RU[k] ?? k} | ${list.length} | ${c('complete')} | ${c('partial')} | ${c('text_only')} |`);
    }
    lines.push('');
    const todo: { key: string; label: string; n: number }[] = [];
    for (const e of entities) {
      for (const f of entityFeatures(e)) {
        if (f.hidden || f.effectsStatus === 'complete') continue;
        todo.push({ key: `${e.key}#${f.key}`, label: `${e.nameRu}: ${f.nameRu} (${f.effectsStatus})`, n: usage.get(e.key) ?? 0 });
      }
    }
    if (todo.length) {
      todo.sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
      lines.push(`### Умения без полной автоматизации (${todo.length})`, '');
      for (const t of todo) lines.push(`- \`${t.key}\` — ${t.label}${t.n ? `, персонажей: ${t.n}` : ''}`);
      lines.push('');
    }
  }
  return lines.join('\n') + '\n';
}
