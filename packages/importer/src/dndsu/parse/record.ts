import { cleanDom, htmlToMarkdown, loadHtml, textOf } from './html';
import {
  field,
  findSourceBook,
  labeledFields,
  leadBlocks,
  mdTables,
  parseTitle,
  splitBlocks,
  splitBracketName,
  stripMd,
  type MdBlock,
  type MdTable,
} from './text';
import { parseEntityUrl, type Section } from '../sections';

/** Результат разбора страницы (SPEC §7.5). */
export type ParsedRecord = {
  externalId: number;
  url: string;
  section: Section;
  homebrew: boolean;
  nameRu: string;
  nameEn?: string;
  sourceBook?: string;
  fields: Record<string, unknown>;
  blocks: { headingRu: string; headingEn?: string; level?: number; md: string }[];
  bodyMd: string;
};

export type PageMeta = { url: string; section: Section; homebrew: boolean; externalId: number; parentUrl?: string };

const CONTENT_ROOTS = '[itemprop="articleBody"], article, main, .card';

/** Общие для всех секций шаги: название, источник, основной текст в Markdown. */
function parseCommon(html: string, meta: PageMeta) {
  const $ = loadHtml(html);
  const title = parseTitle(textOf($('title').first()));
  const headings = $('h1, h2').toArray();
  const heading =
    headings.find((h) => textOf($(h)).includes('[')) ??
    headings.find((h) => textOf($(h)).startsWith(title.name)) ??
    headings[0];
  const names = splitBracketName(heading ? textOf($(heading)) : title.name);
  const rootEl = heading ? $(heading).closest(CONTENT_ROOTS) : $(CONTENT_ROOTS).first();
  const root = rootEl.length ? rootEl.first() : $('body');
  // Ссылки нужны до очистки: по ним находятся подклассы.
  const links = root
    .find('a[href]')
    .toArray()
    .map((a) => parseEntityUrl($(a).attr('href') ?? '', meta.url))
    .filter((x) => x !== null)
    .map((x) => x.url);
  cleanDom($, root);
  if (heading) $(heading).remove();
  const bodyMd = htmlToMarkdown(root.html() ?? '');
  const sourceBook = findSourceBook(bodyMd) ?? title.source;
  return { names, sourceBook, bodyMd, links: [...new Set(links)] };
}

/** Строка «3 уровень, воплощение» / «Заговор, вызов» / «… (ритуал)». */
function spellLevelLine(md: string): string | undefined {
  for (const raw of md.split('\n')) {
    const line = stripMd(raw);
    if (/^(?:заговор|\d{1,2}(?:-?й)?\s+уровень)/i.test(line)) return line;
  }
  return undefined;
}

/** Текст после метки «На больших уровнях». */
function higherLevels(md: string, blocks: MdBlock[]): string | undefined {
  const b = blocks.find((x) => /на (?:больших|более высоких) уровнях/i.test(x.headingRu));
  if (b) return b.md;
  const m = /\*{0,3}На (?:больших|более высоких) уровнях\.?\*{0,3}\.?\s*([\s\S]+?)(?:\n\n|$)/i.exec(md);
  return m?.[1]?.trim();
}

function classTable(tables: MdTable[]): MdTable | undefined {
  return tables.find((t) => t.headers.some((h) => /^уровень$/i.test(h)) && t.rows.length >= 20);
}

function fieldsFor(section: Section, bodyMd: string, blocks: MdBlock[], links: string[], meta: PageMeta) {
  const lf = labeledFields(bodyMd);
  const tables = mdTables(bodyMd);
  switch (section) {
    case 'spells':
      return {
        levelSchool: spellLevelLine(bodyMd),
        castingTime: field(lf, 'время накладывания', 'время сотворения'),
        range: field(lf, 'дистанция'),
        components: field(lf, 'компоненты'),
        duration: field(lf, 'длительность'),
        classes: field(lf, 'классы'),
        subclasses: field(lf, 'архетипы', 'подклассы'),
        higherLevels: higherLevels(bodyMd, blocks),
      };
    case 'classes': {
      const hitDie = field(lf, 'кость хитов');
      return {
        kindHint: hitDie ? 'class' : 'subclass',
        parentUrl: meta.parentUrl,
        hitDie,
        hpFirst: field(lf, 'хиты на 1 уровне', 'хиты на 1-м уровне'),
        hpNext: field(lf, 'хиты на следующих уровнях'),
        armor: field(lf, 'доспехи'),
        weapons: field(lf, 'оружие'),
        tools: field(lf, 'инструменты'),
        savingThrows: field(lf, 'спасброски'),
        skills: field(lf, 'навыки'),
        table: classTable(tables),
        tables: tables.filter((t) => t !== classTable(tables)),
        links: links.filter((l) => l !== meta.url),
      };
    }
    case 'races': {
      const lead = leadBlocks(bodyMd);
      const lb = (re: RegExp) => lead.find((b) => re.test(b.headingRu))?.md;
      return {
        traits: lead.map((b) => ({ headingRu: b.headingRu, headingEn: b.headingEn, md: b.md })),
        asi: lb(/увеличение характеристик/i),
        age: lb(/^возраст/i),
        alignment: lb(/^мировоззрение/i),
        size: lb(/^размер/i),
        speed: lb(/^скорость/i),
        languages: lb(/^языки/i),
        darkvision: lb(/тёмное зрение|темное зрение/i),
      };
    }
    case 'backgrounds':
      return {
        skills: field(lf, 'владение навыками', 'навыки'),
        tools: field(lf, 'владение инструментами', 'инструменты'),
        languages: field(lf, 'языки', 'владение языками'),
        equipment: field(lf, 'снаряжение'),
        tables,
      };
    case 'feats':
      return { prerequisite: field(lf, 'требование', 'требования', 'требуется') };
    case 'items': {
      const typeLine = bodyMd
        .split('\n')
        .map(stripMd)
        .find((l) => /(обычн|необычн|редк|легендарн|артефакт|редкость варьируется)/i.test(l) && l.length < 200);
      return { typeLine };
    }
  }
}

/** Разбор страницы сущности любой секции в `ParsedRecord`. */
export function parseRecord(html: string, meta: PageMeta): ParsedRecord {
  const { names, sourceBook, bodyMd, links } = parseCommon(html, meta);
  const blocks = splitBlocks(bodyMd);
  return {
    externalId: meta.externalId,
    url: meta.url,
    section: meta.section,
    homebrew: meta.homebrew,
    nameRu: names.nameRu,
    nameEn: names.nameEn,
    sourceBook,
    fields: fieldsFor(meta.section, bodyMd, blocks, links, meta) ?? {},
    blocks: blocks
      .filter((b) => b.headingRu)
      .map((b) => ({ headingRu: b.headingRu, headingEn: b.headingEn, level: b.level, md: b.md })),
    bodyMd,
  };
}
