'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import { toast } from 'sonner';
import {
  BoldIcon,
  CodeIcon,
  HighlighterIcon,
  ImageIcon,
  ItalicIcon,
  LinkIcon,
  ListChecksIcon,
  ListIcon,
  ListOrderedIcon,
  MinusIcon,
  QuoteIcon,
  Redo2Icon,
  StrikethroughIcon,
  TableIcon,
  Undo2Icon,
} from 'lucide-react';
import { trpcErrorText, useTRPC, useTRPCClient } from '@/lib/trpc/client';
import { errorMessage, ru } from '@/i18n/ru';
import { SAFE_HREF } from '@/lib/notes/doc';
import type { DocNode, NoteVisibilityValue } from '@/lib/notes/schema';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { LinkPreviewArea } from '../link-preview';
import { NoteMention, WikiLink } from './extensions';
import { linkHref } from '@/lib/notes/links';
import type { SuggestionItem } from './suggestion-list';

const N = ru.notes;
const T = N.toolbar;

type Props = {
  noteId: string;
  campaignId: string | null;
  /** Видимость текущей заметки — её получит заметка, созданная из `[[`. */
  visibility: NoteVisibilityValue;
  content: DocNode;
  editable: boolean;
  onChange?: (doc: DocNode) => void;
  onEditor?: (editor: Editor | null) => void;
};

/** Редактор заметки (SPEC §11.1): TipTap + WikiLink, Mention, задачи, таблицы, картинки. */
export function NoteEditor({ noteId, campaignId, visibility, content, editable, onChange, onEditor }: Props) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const qc = useQueryClient();
  const router = useRouter();
  const ctx = useRef({ campaignId, visibility, onChange });
  useEffect(() => {
    ctx.current = { campaignId, visibility, onChange };
  });

  const extensions = useMemo(() => {
    const lookup = (q: string) =>
      qc.fetchQuery({ ...trpc.notes.lookup.queryOptions({ campaignId: ctx.current.campaignId, q, limit: 8 }), staleTime: 5_000 });
    return [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: 'https',
          isAllowedUri: (url) => SAFE_HREF.test(url),
          HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
        },
      }),
      Placeholder.configure({ placeholder: N.bodyPlaceholder }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit.configure({ table: { resizable: false } }),
      Highlight,
      Image.configure({ allowBase64: false }),
      WikiLink.configure({
        provider: () => ({
          empty: N.wikiEmpty,
          items: async (q) => {
            const rows = (await lookup(q)).filter((r) => r.id !== noteId);
            const items: SuggestionItem[] = rows.map((r) => ({ key: r.id, label: r.title || N.untitled, hint: N.types[r.type] }));
            const exact = rows.some((r) => r.title.trim().toLowerCase() === q.trim().toLowerCase());
            if (q.trim() && !exact) items.push({ key: '__create', label: N.createLinked(q.trim()), create: true });
            return items;
          },
          resolve: async (item, q) => {
            if (!item.create) return { noteId: item.key, label: item.label };
            const title = q.trim();
            try {
              const created = await client.notes.create.mutate({
                campaignId: ctx.current.campaignId,
                title,
                type: 'general',
                visibility: ctx.current.visibility,
              });
              void qc.invalidateQueries({ queryKey: trpc.notes.list.pathKey() });
              return { noteId: created.id, label: title };
            } catch (e) {
              toast.error(trpcErrorText(e));
              return null;
            }
          },
        }),
      }),
      NoteMention.configure({
        provider: () => ({
          empty: N.mentionEmpty,
          items: async (q) => {
            const cid = ctx.current.campaignId;
            const [chars, notes, content] = await Promise.all([
              cid
                ? qc.fetchQuery({ ...trpc.characters.listByCampaign.queryOptions({ campaignId: cid }), staleTime: 30_000 })
                : qc.fetchQuery({ ...trpc.characters.listMine.queryOptions(), staleTime: 30_000 }),
              lookup(q),
              q.trim().length >= 2
                ? qc.fetchQuery({ ...trpc.content.search.queryOptions({ q: q.trim(), limit: 6 }), staleTime: 60_000 })
                : Promise.resolve([]),
            ]);
            const needle = q.trim().toLowerCase();
            const items: SuggestionItem[] = [
              ...chars
                .filter((c) => !needle || c.name.toLowerCase().includes(needle))
                .slice(0, 5)
                .map((c) => ({ key: `character:${c.id}`, label: c.name, group: N.mentionGroups.character })),
              ...notes
                .filter((n) => n.id !== noteId)
                .slice(0, 5)
                .map((n) => ({ key: `note:${n.id}`, label: n.title || N.untitled, hint: N.types[n.type], group: N.mentionGroups.note })),
              ...content.map((e) => ({ key: `content:${e.key}`, label: e.nameRu, hint: ru.library.kinds[e.kind], group: N.mentionGroups.content })),
            ];
            return items;
          },
          resolve: async (item) => {
            const i = item.key.indexOf(':');
            return { targetType: item.key.slice(0, i), targetId: item.key.slice(i + 1), label: item.label };
          },
        }),
      }),
    ];
    // Расширения создаются один раз на заметку; актуальные значения — через `ctx`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  const editor = useEditor(
    {
      extensions,
      content,
      editable,
      immediatelyRender: false,
      editorProps: {
        attributes: { class: 'prose-ps max-w-none', 'aria-label': N.bodyPlaceholder, 'data-testid': 'note-editor' },
        handleClickOn: (_view, _pos, node, _nodePos, event) => {
          if (node.type.name !== 'wikiLink' && node.type.name !== 'mention') return false;
          const target =
            node.type.name === 'wikiLink'
              ? { targetType: 'note', targetId: String(node.attrs.noteId ?? '') }
              : { targetType: String(node.attrs.targetType), targetId: String(node.attrs.targetId ?? '') };
          const href = target.targetId ? linkHref(target, ctx.current.campaignId) : null;
          if (!href) return false;
          event.preventDefault();
          router.push(href);
          return true;
        },
      },
      onUpdate: ({ editor: ed, transaction }) => {
        if (transaction.docChanged) ctx.current.onChange?.(ed.getJSON() as DocNode);
      },
    },
    [noteId],
  );

  useEffect(() => {
    // Без события `update`: смена режима не должна запускать автосохранение.
    if (editor && editor.isEditable !== editable) editor.setEditable(editable, false);
  }, [editor, editable]);
  useEffect(() => {
    onEditor?.(editor);
    return () => onEditor?.(null);
  }, [editor, onEditor]);

  return (
    <div className="grid gap-2">
      {editable && editor && <Toolbar editor={editor} noteId={noteId} />}
      <LinkPreviewArea>
        <EditorContent editor={editor} className="min-h-48 rounded-md border px-3 py-2 focus-within:ring-2 focus-within:ring-ring/40" />
      </LinkPreviewArea>
    </div>
  );
}

function Toolbar({ editor, noteId }: { editor: Editor; noteId: string }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      strike: e.isActive('strike'),
      highlight: e.isActive('highlight'),
      code: e.isActive('code'),
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bulletList: e.isActive('bulletList'),
      orderedList: e.isActive('orderedList'),
      taskList: e.isActive('taskList'),
      blockquote: e.isActive('blockquote'),
      link: e.isActive('link'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const btn = (label: string, active: boolean, onClick: () => void, icon: React.ReactNode, disabled = false) => (
    <Button
      type="button"
      size="icon-sm"
      variant={active ? 'secondary' : 'ghost'}
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {icon}
    </Button>
  );
  const heading = (level: 1 | 2 | 3, label: string, active: boolean) => (
    <Button
      type="button"
      size="sm"
      variant={active ? 'secondary' : 'ghost'}
      className="h-8 px-2 text-xs font-semibold"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
    >
      H{level}
    </Button>
  );
  const upload = async (file: File) => {
    const form = new FormData();
    form.set('file', file);
    form.set('attachedType', 'note');
    form.set('attachedId', noteId);
    const res = await fetch('/api/files', { method: 'POST', body: form, credentials: 'same-origin' });
    const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !body.url) {
      toast.error(errorMessage(body.error));
      return;
    }
    editor.chain().focus().setImage({ src: body.url, alt: file.name.replace(/\.[^.]+$/, '') }).run();
  };
  return (
    <div className={cn('flex flex-wrap items-center gap-0.5 rounded-md border bg-muted/30 p-1')} role="toolbar" aria-label={N.title}>
      {btn(T.bold, state.bold, () => editor.chain().focus().toggleBold().run(), <BoldIcon />)}
      {btn(T.italic, state.italic, () => editor.chain().focus().toggleItalic().run(), <ItalicIcon />)}
      {btn(T.strike, state.strike, () => editor.chain().focus().toggleStrike().run(), <StrikethroughIcon />)}
      {btn(T.highlight, state.highlight, () => editor.chain().focus().toggleHighlight().run(), <HighlighterIcon />)}
      {btn(T.code, state.code, () => editor.chain().focus().toggleCode().run(), <CodeIcon />)}
      <span className="mx-1 h-5 w-px bg-border" aria-hidden />
      {heading(1, T.h1, state.h1)}
      {heading(2, T.h2, state.h2)}
      {heading(3, T.h3, state.h3)}
      <span className="mx-1 h-5 w-px bg-border" aria-hidden />
      {btn(T.bulletList, state.bulletList, () => editor.chain().focus().toggleBulletList().run(), <ListIcon />)}
      {btn(T.orderedList, state.orderedList, () => editor.chain().focus().toggleOrderedList().run(), <ListOrderedIcon />)}
      {btn(T.taskList, state.taskList, () => editor.chain().focus().toggleTaskList().run(), <ListChecksIcon />)}
      {btn(T.quote, state.blockquote, () => editor.chain().focus().toggleBlockquote().run(), <QuoteIcon />)}
      {btn(T.table, false, () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), <TableIcon />)}
      {btn(T.hr, false, () => editor.chain().focus().setHorizontalRule().run(), <MinusIcon />)}
      {btn(
        T.link,
        state.link,
        () => {
          if (editor.isActive('link')) {
            editor.chain().focus().unsetLink().run();
            return;
          }
          const url = window.prompt(T.linkPrompt)?.trim();
          if (url && SAFE_HREF.test(url)) editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
        },
        <LinkIcon />,
      )}
      {btn(N.uploadImage, false, () => fileInput.current?.click(), <ImageIcon />)}
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        aria-label={N.uploadImage}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = '';
        }}
      />
      <span className="ml-auto" />
      {btn(T.undo, false, () => editor.chain().focus().undo().run(), <Undo2Icon />, !state.canUndo)}
      {btn(T.redo, false, () => editor.chain().focus().redo().run(), <Redo2Icon />, !state.canRedo)}
    </div>
  );
}
