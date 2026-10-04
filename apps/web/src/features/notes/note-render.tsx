'use client';
import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import { SAFE_HREF } from '@/lib/notes/doc';
import type { DocMark, DocNode } from '@/lib/notes/schema';
import { cn } from '@/lib/utils';
import { linkHref } from '@/lib/notes/links';
import { LinkPreviewArea } from './link-preview';

/**
 * Просмотр заметки без редактора: JSON документа → React-элементы (никакого HTML-текста,
 * SPEC §16.3). Неизвестные узлы выводятся как их содержимое.
 */
export function NoteRender({
  doc,
  campaignId,
  className,
  highlight,
}: {
  doc: DocNode;
  campaignId: string | null;
  className?: string;
  /** Цели ссылок для подсветки (сравнение заметок). */
  highlight?: Set<string>;
}) {
  const ctx = { campaignId, highlight };
  return (
    <LinkPreviewArea className={cn('prose-ps', className)}>
      {children(doc.content, ctx)}
    </LinkPreviewArea>
  );
}

type Ctx = { campaignId: string | null; highlight?: Set<string> };

function children(nodes: DocNode[] | undefined, ctx: Ctx): ReactNode {
  return (nodes ?? []).map((n, i) => <Fragment key={i}>{node(n, ctx)}</Fragment>);
}

function marked(text: string, marks: DocMark[] | undefined): ReactNode {
  let out: ReactNode = text;
  for (const m of marks ?? []) {
    if (m.type === 'bold') out = <strong>{out}</strong>;
    else if (m.type === 'italic') out = <em>{out}</em>;
    else if (m.type === 'strike') out = <s>{out}</s>;
    else if (m.type === 'underline') out = <u>{out}</u>;
    else if (m.type === 'code') out = <code>{out}</code>;
    else if (m.type === 'highlight') out = <mark>{out}</mark>;
    else if (m.type === 'link' && typeof m.attrs?.href === 'string' && SAFE_HREF.test(m.attrs.href)) {
      out = (
        <a href={m.attrs.href} target="_blank" rel="noopener noreferrer nofollow">
          {out}
        </a>
      );
    }
  }
  return out;
}

function linkNode(target: { targetType: string; targetId: string }, label: string, prefix: string, ctx: Ctx): ReactNode {
  const href = target.targetId ? linkHref(target, ctx.campaignId) : null;
  const hl = ctx.highlight?.has(`${target.targetType}:${target.targetId}`);
  const cls = cn(target.targetType === 'note' && prefix === '' ? 'note-link' : 'note-mention', hl && 'ring-2 ring-primary/50');
  const data = { 'data-link-type': target.targetType, 'data-link-id': target.targetId };
  return href ? (
    <Link href={href} className={cls} {...data}>
      {prefix}
      {label}
    </Link>
  ) : (
    <span className={cn(cls, 'note-link-missing')} {...data}>
      {prefix}
      {label}
    </span>
  );
}

function node(n: DocNode, ctx: Ctx): ReactNode {
  const c = () => children(n.content, ctx);
  switch (n.type) {
    case 'text':
      return marked(n.text ?? '', n.marks);
    case 'hardBreak':
      return <br />;
    case 'paragraph':
      return <p>{c()}</p>;
    case 'heading': {
      const level = Number(n.attrs?.level ?? 1);
      return level === 1 ? <h1>{c()}</h1> : level === 2 ? <h2>{c()}</h2> : <h3>{c()}</h3>;
    }
    case 'bulletList':
      return <ul>{c()}</ul>;
    case 'orderedList':
      return <ol start={Number(n.attrs?.start ?? 1) || 1}>{c()}</ol>;
    case 'listItem':
      return <li>{c()}</li>;
    case 'taskList':
      return <ul data-type="taskList">{c()}</ul>;
    case 'taskItem':
      return (
        <li data-checked={n.attrs?.checked ? 'true' : 'false'}>
          <label>
            <input type="checkbox" checked={!!n.attrs?.checked} readOnly disabled />
          </label>
          <div>{c()}</div>
        </li>
      );
    case 'blockquote':
      return <blockquote>{c()}</blockquote>;
    case 'codeBlock':
      return (
        <pre>
          <code>{c()}</code>
        </pre>
      );
    case 'horizontalRule':
      return <hr />;
    case 'image': {
      const src = String(n.attrs?.src ?? '');
      return SAFE_HREF.test(src) ? <img src={src} alt={String(n.attrs?.alt ?? '')} /> : null;
    }
    case 'table':
      return (
        <div className="overflow-x-auto">
          <table>
            <tbody>{c()}</tbody>
          </table>
        </div>
      );
    case 'tableRow':
      return <tr>{c()}</tr>;
    case 'tableHeader':
      return <th>{c()}</th>;
    case 'tableCell':
      return <td>{c()}</td>;
    case 'wikiLink':
      return linkNode({ targetType: 'note', targetId: String(n.attrs?.noteId ?? '') }, String(n.attrs?.label ?? ''), '', ctx);
    case 'mention':
      return linkNode(
        { targetType: String(n.attrs?.targetType ?? ''), targetId: String(n.attrs?.targetId ?? '') },
        String(n.attrs?.label ?? ''),
        '@',
        ctx,
      );
    default:
      return c();
  }
}

