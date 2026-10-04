import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { parse as parseYaml } from 'yaml';
import type { PhrasingContent, Root, RootContent } from 'mdast';
import type { DocMark, DocNode } from '@/lib/notes/schema';
import { SAFE_HREF } from '@/lib/notes/doc';

/**
 * Импорт Markdown (формат Obsidian, SPEC §11.5) в JSON документа TipTap.
 * `[[Заголовок]]` и `[[Заголовок|подпись]]` становятся узлами `wikiLink` с `noteId: null`
 * и `title` — их разрешают по заголовку после импорта всех файлов.
 */

export type ParsedMarkdown = { frontmatter: Record<string, unknown>; doc: DocNode };

/** Отделить YAML-frontmatter (`---` … `---`). Ошибочный YAML игнорируется. */
export function splitFrontmatter(src: string): { frontmatter: Record<string, unknown>; body: string } {
  const text = (src.charCodeAt(0) === 0xfeff ? src.slice(1) : src).replace(/\r\n?/g, '\n');
  const m = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(text);
  if (!m) return { frontmatter: {}, body: text };
  let fm: unknown = {};
  try {
    fm = parseYaml(m[1]!, { maxAliasCount: 10 });
  } catch {
    fm = {};
  }
  return {
    frontmatter: fm && typeof fm === 'object' && !Array.isArray(fm) ? (fm as Record<string, unknown>) : {},
    body: text.slice(m[0].length),
  };
}

const WIKI = /\[\[([^[\]|\n]+?)(?:\|([^[\]\n]+?))?\]\]/g;
const HIGHLIGHT = /==([^=\n]+?)==/g;

/** Текст с разбором `[[…]]` и `==…==`. */
function textNodes(text: string, marks: DocMark[]): DocNode[] {
  const out: DocNode[] = [];
  const pushText = (t: string, m: DocMark[]) => {
    if (!t) return;
    let last = 0;
    for (const h of t.matchAll(HIGHLIGHT)) {
      if (h.index! > last) out.push(withMarks({ type: 'text', text: t.slice(last, h.index) }, m));
      out.push(withMarks({ type: 'text', text: h[1]! }, [...m, { type: 'highlight' }]));
      last = h.index! + h[0].length;
    }
    if (last < t.length) out.push(withMarks({ type: 'text', text: t.slice(last) }, m));
  };
  let last = 0;
  for (const w of text.matchAll(WIKI)) {
    pushText(text.slice(last, w.index), marks);
    const title = w[1]!.trim();
    out.push({ type: 'wikiLink', attrs: { noteId: null, label: (w[2] ?? w[1]!).trim(), title } });
    last = w.index! + w[0].length;
  }
  pushText(text.slice(last), marks);
  return out;
}

function withMarks(n: DocNode, marks: DocMark[]): DocNode {
  return marks.length ? { ...n, marks } : n;
}

function phrasing(nodes: PhrasingContent[], marks: DocMark[] = []): DocNode[] {
  return nodes.flatMap((n): DocNode[] => {
    switch (n.type) {
      case 'text':
        return textNodes(n.value, marks);
      case 'strong':
        return phrasing(n.children, [...marks, { type: 'bold' }]);
      case 'emphasis':
        return phrasing(n.children, [...marks, { type: 'italic' }]);
      case 'delete':
        return phrasing(n.children, [...marks, { type: 'strike' }]);
      case 'inlineCode':
        return n.value ? [{ type: 'text', text: n.value, marks: [...marks, { type: 'code' }] }] : [];
      case 'break':
        return [{ type: 'hardBreak' }];
      case 'link':
        return SAFE_HREF.test(n.url)
          ? phrasing(n.children, [...marks, { type: 'link', attrs: { href: n.url } }])
          : phrasing(n.children, marks);
      case 'image':
        // Картинки — отдельные блоки: см. `paragraph`.
        return [];
      case 'html':
        return n.value ? [withMarks({ type: 'text', text: n.value }, marks)] : [];
      default:
        return 'children' in n ? phrasing((n as { children: PhrasingContent[] }).children, marks) : [];
    }
  });
}

/** Абзац; картинки внутри абзаца выносятся в отдельные блоки. */
function paragraph(children: PhrasingContent[]): DocNode[] {
  const out: DocNode[] = [];
  let buf: PhrasingContent[] = [];
  const flush = () => {
    const content = phrasing(buf);
    if (content.length) out.push({ type: 'paragraph', content });
    buf = [];
  };
  for (const c of children) {
    if (c.type === 'image') {
      flush();
      if (SAFE_HREF.test(c.url)) out.push({ type: 'image', attrs: { src: c.url, alt: c.alt ?? '' } });
    } else buf.push(c);
  }
  flush();
  return out;
}

function blocks(nodes: RootContent[]): DocNode[] {
  return nodes.flatMap((n): DocNode[] => {
    switch (n.type) {
      case 'paragraph':
        return paragraph(n.children);
      case 'heading': {
        const content = phrasing(n.children);
        return [{ type: 'heading', attrs: { level: Math.min(6, n.depth) }, ...(content.length ? { content } : {}) }];
      }
      case 'blockquote': {
        const content = blocks(n.children);
        return [{ type: 'blockquote', content: content.length ? content : [{ type: 'paragraph' }] }];
      }
      case 'code':
        return [{ type: 'codeBlock', attrs: { language: n.lang ?? null }, ...(n.value ? { content: [{ type: 'text', text: n.value }] } : {}) }];
      case 'thematicBreak':
        return [{ type: 'horizontalRule' }];
      case 'list': {
        const task = n.children.some((i) => typeof i.checked === 'boolean');
        const items = n.children.map((i): DocNode => {
          const content = blocks(i.children);
          return {
            type: task ? 'taskItem' : 'listItem',
            ...(task ? { attrs: { checked: i.checked === true } } : {}),
            content: content.length ? content : [{ type: 'paragraph' }],
          };
        });
        if (task) return [{ type: 'taskList', content: items }];
        return [n.ordered ? { type: 'orderedList', attrs: { start: n.start ?? 1 }, content: items } : { type: 'bulletList', content: items }];
      }
      case 'table':
        return [
          {
            type: 'table',
            content: n.children.map((row, ri) => ({
              type: 'tableRow',
              content: row.children.map((cell) => {
                const content = phrasing(cell.children);
                return { type: ri === 0 ? 'tableHeader' : 'tableCell', content: [{ type: 'paragraph', ...(content.length ? { content } : {}) }] };
              }),
            })),
          },
        ];
      case 'html':
        return n.value.trim() ? [{ type: 'paragraph', content: [{ type: 'text', text: n.value }] }] : [];
      default:
        return 'children' in n ? blocks((n as { children: RootContent[] }).children) : [];
    }
  });
}

export function markdownToDoc(markdown: string): DocNode {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown) as Root;
  const content = blocks(tree.children);
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}

export function parseMarkdownNote(src: string): ParsedMarkdown {
  const { frontmatter, body } = splitFrontmatter(src);
  return { frontmatter, doc: markdownToDoc(body) };
}

