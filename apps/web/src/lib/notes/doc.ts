import type { DocMark, DocNode } from './schema';
import { CHARACTER_REF_FIELDS, NOTE_REF_FIELDS, type AnyNoteFields, type NoteType } from './schema';

/**
 * Работа с JSON документа TipTap без самого TipTap: плоский текст для поиска,
 * ссылки для `note_links`, Markdown для экспорта (SPEC §11.1, §11.5).
 */

/** Встроенные узлы (всё остальное — блоки). */
const INLINE = new Set(['text', 'hardBreak', 'wikiLink', 'mention']);
export const LINK_TARGET_TYPES = ['note', 'character', 'content'] as const;
export type LinkTargetType = (typeof LINK_TARGET_TYPES)[number];

export function inlineText(n: DocNode): string {
  if (n.type === 'text') return n.text ?? '';
  if (n.type === 'hardBreak') return '\n';
  if (n.type === 'wikiLink' || n.type === 'mention') return String(n.attrs?.label ?? '');
  return (n.content ?? []).map(inlineText).join('');
}

const isTextBlock = (n: DocNode) => !!n.content?.length && n.content.every((c) => INLINE.has(c.type));

/** Плоский текст документа: по строке на текстовый блок. */
export function docText(doc: DocNode): string {
  const lines: string[] = [];
  const walk = (n: DocNode) => {
    if (n.type === 'image') {
      const alt = String(n.attrs?.alt ?? '').trim();
      if (alt) lines.push(alt);
      return;
    }
    if (!n.content?.length) return;
    if (isTextBlock(n)) {
      lines.push(inlineText(n));
      return;
    }
    n.content.forEach(walk);
  };
  walk(doc);
  return lines
    .map((l) => l.trimEnd())
    .filter((l) => l.trim())
    .join('\n');
}

export type NoteLinkRef = { targetType: LinkTargetType; targetId: string; context: string };

const CONTEXT_MAX = 200;

function clip(text: string, around: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= CONTEXT_MAX) return t;
  const at = Math.max(0, t.indexOf(around));
  const start = Math.max(0, Math.min(at - CONTEXT_MAX / 2, t.length - CONTEXT_MAX));
  return `${start > 0 ? '…' : ''}${t.slice(start, start + CONTEXT_MAX)}…`;
}

/** Ссылки из узлов WikiLink и Mention с текстом блока вокруг ссылки. */
export function docLinks(doc: DocNode): NoteLinkRef[] {
  const out = new Map<string, NoteLinkRef>();
  const walk = (n: DocNode, block: DocNode | null) => {
    const ctxBlock = isTextBlock(n) ? n : block;
    if (n.type === 'wikiLink' || n.type === 'mention') {
      const targetType = n.type === 'wikiLink' ? 'note' : n.attrs?.targetType;
      const targetId = n.type === 'wikiLink' ? n.attrs?.noteId : n.attrs?.targetId;
      if (
        typeof targetId === 'string' &&
        targetId.length > 0 &&
        targetId.length <= 200 &&
        (LINK_TARGET_TYPES as readonly unknown[]).includes(targetType)
      ) {
        const key = `${String(targetType)}:${targetId}`;
        if (!out.has(key)) {
          const label = String(n.attrs?.label ?? '');
          out.set(key, {
            targetType: targetType as LinkTargetType,
            targetId,
            context: ctxBlock ? clip(inlineText(ctxBlock), label) : label,
          });
        }
      }
    }
    for (const c of n.content ?? []) walk(c, ctxBlock);
  };
  walk(doc, null);
  return [...out.values()];
}

/** Ссылки из полей типа (`location`, `giver`, `participants`…). Контекст — `field:<имя>`. */
export function fieldLinks(type: NoteType, fields: AnyNoteFields): NoteLinkRef[] {
  const out: NoteLinkRef[] = [];
  const push = (targetType: LinkTargetType, name: string) => {
    const v = fields[name];
    for (const id of Array.isArray(v) ? v : v ? [v] : []) {
      if (typeof id === 'string') out.push({ targetType, targetId: id, context: `field:${name}` });
    }
  };
  for (const f of NOTE_REF_FIELDS[type] ?? []) push('note', f);
  for (const f of CHARACTER_REF_FIELDS[type] ?? []) push('character', f);
  return out;
}

/** Все ссылки заметки без повторов (узлы документа важнее полей — у них контекст). */
export function noteLinks(doc: DocNode, type: NoteType, fields: AnyNoteFields): NoteLinkRef[] {
  const out = new Map<string, NoteLinkRef>();
  for (const l of [...docLinks(doc), ...fieldLinks(type, fields)]) {
    const key = `${l.targetType}:${l.targetId}`;
    if (!out.has(key)) out.set(key, l);
  }
  return [...out.values()];
}

/** Заменить ссылки на заметки (для копирования/импорта с новыми id). */
export function mapDoc(doc: DocNode, fn: (n: DocNode) => DocNode): DocNode {
  const n = fn(doc);
  return n.content ? { ...n, content: n.content.map((c) => mapDoc(c, fn)) } : n;
}

// ─── Markdown (экспорт в формате Obsidian) ───────────────────────────────

export const SAFE_HREF = /^(https?:|mailto:|\/(?!\/))/i;

function escapeInline(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/([*_`[\]])/g, '\\$1')
    .replace(/~~/g, '\\~\\~')
    .replace(/==/g, '\\=\\=');
}

function escapeLineStart(line: string): string {
  return line.replace(/^(\s*)([#>+-]|\d+\.)(?=\s|$)/, '$1\\$2');
}

type MdCtx = { noteTitle: (id: string) => string | undefined };

function wrapMarks(text: string, marks: DocMark[] | undefined): string {
  let out = text;
  let href: string | null = null;
  for (const m of marks ?? []) {
    if (m.type === 'code') return `\`${text.replace(/`/g, 'ˋ')}\``;
  }
  for (const m of marks ?? []) {
    if (m.type === 'bold') out = `**${out}**`;
    else if (m.type === 'italic') out = `*${out}*`;
    else if (m.type === 'strike') out = `~~${out}~~`;
    else if (m.type === 'highlight') out = `==${out}==`;
    else if (m.type === 'link' && typeof m.attrs?.href === 'string' && SAFE_HREF.test(m.attrs.href)) href = m.attrs.href;
  }
  return href ? `[${out}](${href.replace(/\)/g, '%29')})` : out;
}

function inlineMd(nodes: DocNode[] | undefined, ctx: MdCtx): string {
  return (nodes ?? [])
    .map((n) => {
      if (n.type === 'text') return wrapMarks(escapeInline(n.text ?? ''), n.marks);
      if (n.type === 'hardBreak') return '\\\n';
      if (n.type === 'wikiLink') {
        const label = String(n.attrs?.label ?? '');
        const title = (typeof n.attrs?.noteId === 'string' ? ctx.noteTitle(n.attrs.noteId) : undefined) ?? label;
        return label && label !== title ? `[[${title}|${label}]]` : `[[${title}]]`;
      }
      if (n.type === 'mention') {
        const label = String(n.attrs?.label ?? '');
        if (n.attrs?.targetType === 'note' && typeof n.attrs.targetId === 'string') {
          return `[[${ctx.noteTitle(n.attrs.targetId) ?? label}]]`;
        }
        return `@${escapeInline(label)}`;
      }
      return inlineMd(n.content, ctx);
    })
    .join('');
}

function blockMd(n: DocNode, ctx: MdCtx): string[] {
  switch (n.type) {
    case 'paragraph':
      return [
        inlineMd(n.content, ctx)
          .split('\n')
          .map((l, i) => (i === 0 ? escapeLineStart(l) : l))
          .join('\n'),
      ];
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(n.attrs?.level ?? 1)));
      return [`${'#'.repeat(level)} ${inlineMd(n.content, ctx)}`];
    }
    case 'blockquote':
      return [
        blocksMd(n.content, ctx)
          .split('\n')
          .map((l) => (l ? `> ${l}` : '>'))
          .join('\n'),
      ];
    case 'codeBlock': {
      const lang = typeof n.attrs?.language === 'string' ? n.attrs.language : '';
      return [`\`\`\`${lang}\n${inlineText(n)}\n\`\`\``];
    }
    case 'horizontalRule':
      return ['---'];
    case 'image': {
      const src = String(n.attrs?.src ?? '');
      return SAFE_HREF.test(src) ? [`![${escapeInline(String(n.attrs?.alt ?? ''))}](${src})`] : [];
    }
    case 'bulletList':
    case 'orderedList':
    case 'taskList': {
      let num = Number(n.attrs?.start ?? 1) || 1;
      const items = (n.content ?? []).map((item) => {
        const marker =
          n.type === 'taskList' ? `- [${item.attrs?.checked ? 'x' : ' '}] ` : n.type === 'orderedList' ? `${num++}. ` : '- ';
        const body = blocksMd(item.content, ctx, true);
        const pad = ' '.repeat(marker.length);
        return body
          .split('\n')
          .map((l, i) => (i === 0 ? marker + l : l ? pad + l : l))
          .join('\n');
      });
      return [items.join('\n')];
    }
    case 'table': {
      const rows = (n.content ?? []).map((r) =>
        (r.content ?? []).map((c) => blocksMd(c.content, ctx, true).replace(/\n+/g, ' ').replace(/\|/g, '\\|')),
      );
      if (!rows.length) return [];
      const width = Math.max(...rows.map((r) => r.length));
      const line = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? '').join(' | ')} |`;
      return [[line(rows[0]!), `| ${Array.from({ length: width }, () => '---').join(' | ')} |`, ...rows.slice(1).map(line)].join('\n')];
    }
    default:
      return n.content?.length ? (isTextBlock(n) ? [inlineMd(n.content, ctx)] : [blocksMd(n.content, ctx)]) : [];
  }
}

function blocksMd(nodes: DocNode[] | undefined, ctx: MdCtx, tight = false): string {
  return (nodes ?? [])
    .flatMap((n) => blockMd(n, ctx))
    .join(tight ? '\n' : '\n\n');
}

/** Markdown тела заметки. WikiLink → `[[Заголовок]]` (актуальный заголовок цели). */
export function docToMarkdown(doc: DocNode, noteTitle: (id: string) => string | undefined): string {
  return blocksMd(doc.content, { noteTitle }).trim() + '\n';
}
