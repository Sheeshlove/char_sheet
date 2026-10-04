/** Разбор Markdown-текста страницы dnd.su: названия, поля «Метка: значение», блоки, таблицы. */

/** «Огненный шар [Fireball]» → { nameRu: 'Огненный шар', nameEn: 'Fireball' }. */
export function splitBracketName(s: string): { nameRu: string; nameEn?: string } {
  const clean = s.replace(/\s+/g, ' ').trim();
  const m = /^(.*?)\s*\[([^\]]+)\]\s*$/.exec(clean);
  if (!m || !m[1]) return { nameRu: clean };
  return { nameRu: m[1].trim(), nameEn: m[2]!.trim() };
}

/** `<title>` вида «Варвар / Классы D&D 5 / Player's Handbook». */
export function parseTitle(title: string): { name: string; sectionTitle?: string; source?: string } {
  const parts = title
    .split(' / ')
    .map((p) => p.trim())
    .filter(Boolean);
  return { name: parts[0] ?? title.trim(), sectionTitle: parts[1], source: parts[2] };
}

/** «Источник: «Player's handbook»» → `Player's handbook`. */
export function findSourceBook(text: string): string | undefined {
  const m = /Источник\s*:\s*[«"„]([^»"“]+)[»"“]/.exec(text) ?? /Источник\s*:\s*([^\n]+)/.exec(text);
  return m?.[1]?.replace(/\*+/g, '').trim() || undefined;
}

/** Убирает Markdown-разметку выделения из строки. */
export function stripMd(s: string): string {
  return s
    .replace(/\*\*\*|\*\*|__|\*|_(?=\S)|(?<=\S)_/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normLabel(s: string): string {
  return stripMd(s).replace(/[:.]\s*$/, '').toLowerCase().replace(/ё/g, 'е').trim();
}

/**
 * Поля «**Метка:** значение» / «Метка: значение» (в т. ч. пункты списка).
 * Ключ — метка в нижнем регистре без двоеточия. Первое вхождение побеждает.
 */
export function labeledFields(md: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of md.split('\n')) {
    const line = raw.replace(/^\s*(?:[-*+]|\d+\.)\s+/, '').trim();
    if (!line || line.startsWith('|') || line.startsWith('#')) continue;
    const m =
      /^\*{2,3}([^*]{1,60}?):?\*{2,3}:?\s*(.+)$/.exec(line) ?? /^([А-ЯЁA-Z][А-ЯЁа-яёA-Za-z ,()-]{1,50}):\s+(.+)$/.exec(line);
    if (!m) continue;
    const label = normLabel(m[1]!);
    if (!label || label in out) continue;
    out[label] = stripMd(m[2]!);
  }
  return out;
}

/** Поле по одной из меток (без учёта регистра и «ё»). */
export function field(fields: Record<string, string>, ...labels: string[]): string | undefined {
  for (const l of labels) {
    const v = fields[normLabel(l)];
    if (v !== undefined) return v;
  }
  return undefined;
}

export type MdBlock = { headingRu: string; headingEn?: string; level?: number; depth: number; md: string };

/** Уровень из текста: «На 3 уровне», «Начиная с 11-го уровня», «3-й уровень». */
export function levelFromText(text: string): number | undefined {
  const m =
    /(?:на|начиная\s+с|с|достигнув|достигаете)\s+(\d{1,2})(?:-?(?:го|м|й|ом))?\s+уровн/i.exec(text) ??
    /(\d{1,2})(?:-?(?:й|го|ой))?\s+уровень/i.exec(text);
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 20 ? n : undefined;
}

/**
 * Разбивка по заголовкам `##`…`######` (глубже заголовка страницы). Текст до первого
 * заголовка — блок с пустым названием.
 */
export function splitBlocks(md: string, minDepth = 2): MdBlock[] {
  const blocks: MdBlock[] = [];
  let cur: MdBlock = { headingRu: '', depth: 0, md: '' };
  const flush = () => {
    cur.md = cur.md.trim();
    if (cur.headingRu || cur.md) {
      if (cur.headingRu) cur.level ??= levelFromText(cur.md.split('\n\n')[0] ?? '');
      blocks.push(cur);
    }
  };
  for (const line of md.split('\n')) {
    const h = /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);
    if (h && h[1]!.length >= minDepth) {
      flush();
      const heading = stripMd(h[2]!);
      const { nameRu, nameEn } = splitBracketName(heading);
      cur = { headingRu: nameRu, headingEn: nameEn, depth: h[1]!.length, md: '', level: levelFromText(heading) };
      continue;
    }
    cur.md += `${line}\n`;
  }
  flush();
  return blocks;
}

/**
 * Абзацы, начинающиеся с полужирного заголовка: «**Увеличение характеристик.** Текст…».
 * Так на dnd.su оформлены особенности рас и некоторые умения.
 */
export function leadBlocks(md: string): MdBlock[] {
  const out: MdBlock[] = [];
  for (const para of md.split(/\n{2,}/)) {
    const m = /^\*{2,3}([^*]+?)\*{2,3}\s*(?:\.\s*)?([\s\S]*)$/.exec(para.trim());
    if (!m) {
      if (out.length && para.trim() && !/^#/.test(para.trim())) out[out.length - 1]!.md += `\n\n${para.trim()}`;
      continue;
    }
    const heading = m[1]!.replace(/[.:]\s*$/, '').trim();
    const { nameRu, nameEn } = splitBracketName(heading);
    out.push({ headingRu: nameRu, headingEn: nameEn, depth: 0, md: m[2]!.trim(), level: levelFromText(m[2]!) });
  }
  return out;
}

export type MdTable = { headers: string[]; rows: string[][] };

/** GFM-таблицы Markdown. */
export function mdTables(md: string): MdTable[] {
  const tables: MdTable[] = [];
  const lines = md.split('\n');
  const cells = (l: string) =>
    l
      .trim()
      .replace(/^\||\|$/g, '')
      .split(/(?<!\\)\|/)
      .map((c) => stripMd(c.replace(/\\\|/g, '|')));
  for (let i = 0; i < lines.length - 1; i++) {
    const head = lines[i]!.trim();
    const sep = lines[i + 1]!.trim();
    if (!head.startsWith('|') || !/^\|?\s*:?-{3,}/.test(sep)) continue;
    const t: MdTable = { headers: cells(head), rows: [] };
    let j = i + 2;
    while (j < lines.length && lines[j]!.trim().startsWith('|')) {
      t.rows.push(cells(lines[j]!));
      j++;
    }
    tables.push(t);
    i = j - 1;
  }
  return tables;
}
