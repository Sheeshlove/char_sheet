'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { diffLines } from 'diff';
import { toast } from 'sonner';
import { HistoryIcon, SendIcon, TagIcon } from 'lucide-react';
import { useTRPC } from '@/lib/trpc/client';
import { ru } from '@/i18n/ru';
import { docText } from '@/lib/notes/doc';
import { TAG_COLORS, type DocNode } from '@/lib/notes/schema';
import { cn, formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { NoteRender } from './note-render';
import { TagForm } from './notes-sidebar';

const N = ru.notes;

/** Обратные ссылки с контекстом (§11.4). */
export function Backlinks({ noteId, campaignId }: { noteId: string; campaignId: string | null }) {
  const trpc = useTRPC();
  const q = useQuery(trpc.notes.backlinks.queryOptions({ noteId }));
  const base = campaignId ? `/campaigns/${campaignId}/notes` : '/notes';
  return (
    <section className="grid gap-2" aria-labelledby="backlinks-h" data-testid="backlinks">
      <h3 id="backlinks-h" className="text-sm font-semibold">
        {N.backlinks} {q.data?.length ? <span className="text-muted-foreground">({q.data.length})</span> : null}
      </h3>
      {q.data?.length ? (
        <ul className="grid gap-1.5">
          {q.data.map((b) => (
            <li key={b.id} className="rounded-md border px-3 py-2 text-sm">
              <Link href={`${base}/${b.id}`} className="font-medium hover:underline">
                {b.title || N.untitled}
              </Link>{' '}
              <span className="text-xs text-muted-foreground">{N.types[b.type]}</span>
              {b.context && (
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {b.context.startsWith('field:') ? N.fieldContext(N.fields[b.context.slice(6)] ?? b.context.slice(6)) : b.context}
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">{N.noBacklinks}</p>
      )}
    </section>
  );
}

/** Выбор тегов заметки; новый тег можно создать тут же. */
export function TagsPicker({
  noteId,
  campaignId,
  selected,
  disabled,
}: {
  noteId: string;
  campaignId: string | null;
  selected: { id: string; name: string; color: string }[];
  disabled: boolean;
}) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const tags = useQuery(trpc.tags.list.queryOptions({ campaignId }));
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(TAG_COLORS[5]);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: trpc.notes.get.queryKey({ noteId }) });
    void qc.invalidateQueries({ queryKey: trpc.notes.list.pathKey() });
    void qc.invalidateQueries({ queryKey: trpc.tags.list.queryKey() });
  };
  const setTags = useMutation(trpc.tags.setForNote.mutationOptions({ onSuccess: refresh }));
  const create = useMutation(
    trpc.tags.create.mutationOptions({
      onSuccess: (t) => {
        setName('');
        setTags.mutate({ noteId, tagIds: [...selected.map((s) => s.id), t.id] });
      },
    }),
  );
  const ids = selected.map((s) => s.id);
  return (
    <div className="flex flex-wrap items-center gap-1" data-testid="note-tags">
      {selected.map((t) => (
        <span key={t.id} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
          <span className="size-2 rounded-full" style={{ backgroundColor: t.color }} aria-hidden />
          {t.name}
        </span>
      ))}
      {!disabled && (
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" data-testid="tags-edit">
              <TagIcon />
              {N.addTag}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="grid w-64 gap-3">
            {tags.data?.length ? (
              <ul className="grid max-h-48 gap-1 overflow-y-auto">
                {tags.data.map((t) => (
                  <li key={t.id}>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={ids.includes(t.id)}
                        onCheckedChange={(v) => setTags.mutate({ noteId, tagIds: v ? [...ids, t.id] : ids.filter((x) => x !== t.id) })}
                      />
                      <span className="size-2 rounded-full" style={{ backgroundColor: t.color }} aria-hidden />
                      {t.name}
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">{N.noTags}</p>
            )}
            <div className="border-t pt-2">
              <TagForm name={name} setName={setName} color={color} setColor={setColor} onSubmit={() => create.mutate({ campaignId, name: name.trim(), color })} />
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

/** История версий: просмотр, текстовое сравнение с текущей, восстановление (§11.5). */
export function VersionsDialog({
  noteId,
  campaignId,
  current,
  canEdit,
  open,
  onOpenChange,
  onRestore,
}: {
  noteId: string;
  campaignId: string | null;
  current: { title: string; body: DocNode };
  canEdit: boolean;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onRestore: (versionId: string) => void;
}) {
  const trpc = useTRPC();
  const versions = useQuery({ ...trpc.notes.versions.list.queryOptions({ noteId }), enabled: open });
  const [picked, setPicked] = useState<string | null>(null);
  const version = useQuery({ ...trpc.notes.versions.get.queryOptions({ versionId: picked ?? '' }), enabled: open && !!picked });
  const diff = useMemo(
    () =>
      version.data
        ? diffLines(`${version.data.title}\n\n${docText(version.data.body)}\n`, `${current.title}\n\n${docText(current.body)}\n`)
        : [],
    [version.data, current],
  );
  const [mode, setMode] = useState<'diff' | 'view'>('diff');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{N.versions}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          <ul className="grid max-h-[60vh] content-start gap-1 overflow-y-auto" data-testid="versions">
            {versions.data?.length ? (
              versions.data.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => setPicked(v.id)}
                    className={cn('w-full rounded-md border px-2 py-1.5 text-left text-xs hover:bg-accent', picked === v.id && 'border-primary bg-accent')}
                  >
                    <div className="font-medium">{formatDateTime(v.createdAt)}</div>
                    <div className="truncate text-muted-foreground">
                      {v.title || N.untitled} · {v.authorName ?? ''}
                    </div>
                  </button>
                </li>
              ))
            ) : (
              <li className="text-xs text-muted-foreground">{N.noVersions}</li>
            )}
          </ul>
          <div className="min-w-0">
            {version.data && (
              <>
                <div className="mb-2 flex gap-1">
                  <Button size="sm" variant={mode === 'diff' ? 'secondary' : 'ghost'} onClick={() => setMode('diff')}>
                    {N.compareWithCurrent}
                  </Button>
                  <Button size="sm" variant={mode === 'view' ? 'secondary' : 'ghost'} onClick={() => setMode('view')}>
                    {ru.common.show}
                  </Button>
                </div>
                <div className="max-h-[52vh] overflow-y-auto rounded-md border p-3">
                  {mode === 'diff' ? (
                    <pre className="text-xs whitespace-pre-wrap" data-testid="version-diff">
                      {diff.map((part, i) => (
                        <span
                          key={i}
                          className={cn(
                            part.added && 'bg-green-500/15 text-green-800 dark:text-green-300',
                            part.removed && 'bg-red-500/15 text-red-800 line-through dark:text-red-300',
                          )}
                        >
                          {part.value}
                        </span>
                      ))}
                    </pre>
                  ) : (
                    <NoteRender doc={version.data.body} campaignId={campaignId} />
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        <DialogFooter>
          {canEdit && picked && (
            <Button
              onClick={() => {
                onRestore(picked);
                onOpenChange(false);
              }}
            >
              <HistoryIcon />
              {N.restoreVersion}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** «Отправить игрокам» (§11.6): адресаты — участники кампании. */
export function ShareDialog({
  noteId,
  campaignId,
  authorId,
  shares,
  open,
  onOpenChange,
}: {
  noteId: string;
  campaignId: string;
  authorId: string;
  shares: { userId: string; readAt: Date | null; name: string }[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const members = useQuery({ ...trpc.campaigns.members.list.queryOptions({ campaignId }), enabled: open });
  const others = members.data?.filter((m) => m.userId !== authorId) ?? [];
  const [picked, setPicked] = useState<string[] | null>(null);
  const current = picked ?? shares.map((s) => s.userId);
  const share = useMutation(
    trpc.notes.share.mutationOptions({
      onSuccess: (r) => {
        toast.success(N.shared(r.recipients));
        void qc.invalidateQueries({ queryKey: trpc.notes.get.queryKey({ noteId }) });
        void qc.invalidateQueries({ queryKey: trpc.notes.list.pathKey() });
        onOpenChange(false);
        setPicked(null);
      },
    }),
  );
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setPicked(null);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{N.shareTitle}</DialogTitle>
          <DialogDescription>{N.shareHint}</DialogDescription>
        </DialogHeader>
        <label className="flex items-center gap-2 text-sm font-medium">
          <Checkbox
            checked={others.length > 0 && current.length === others.length}
            onCheckedChange={(v) => setPicked(v ? others.map((m) => m.userId) : [])}
          />
          {N.shareAll}
        </label>
        <ul className="grid gap-1.5 border-t pt-2" data-testid="share-members">
          {others.map((m) => {
            const s = shares.find((x) => x.userId === m.userId);
            return (
              <li key={m.userId}>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={current.includes(m.userId)}
                    onCheckedChange={(v) => setPicked(v ? [...current, m.userId] : current.filter((x) => x !== m.userId))}
                  />
                  {m.displayName}
                  {s && <span className="text-xs text-muted-foreground">{s.readAt ? N.read : N.unread}</span>}
                </label>
              </li>
            );
          })}
        </ul>
        <DialogFooter>
          <Button onClick={() => share.mutate({ noteId, userIds: current })} disabled={share.isPending}>
            <SendIcon />
            {N.share}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
