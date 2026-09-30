'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ColumnsIcon, EyeIcon, InboxIcon, LockIcon, PinIcon, RotateCcwIcon, SearchIcon, Trash2Icon, UsersIcon } from 'lucide-react';
import { useTRPC } from '@/lib/trpc/client';
import { ru } from '@/i18n/ru';
import { NOTE_SORTS } from '@/lib/notes/schema';
import { cn, formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Snippet } from '@/features/notes/snippet';
import { notesBase } from './notes-sidebar';
import type { NotesView } from './use-notes-filter';

const N = ru.notes;
export const VIS_ICON = { private: LockIcon, gm: EyeIcon, party: UsersIcon } as const;

/** Центральная колонка: поиск, сортировка, список (бесконечная прокрутка), выбор для сравнения. */
export function NotesList({
  campaignId,
  view,
  setView,
  selectedId,
  query,
}: {
  campaignId: string | null;
  view: NotesView;
  setView: (v: NotesView | ((v: NotesView) => NotesView)) => void;
  selectedId: string | null;
  query: string;
}) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const router = useRouter();
  const [text, setText] = useState(view.filter.text ?? '');
  const [compare, setCompare] = useState<string[] | null>(null);
  const base = notesBase(campaignId);
  const list = useInfiniteQuery(
    trpc.notes.list.infiniteQueryOptions(
      { campaignId, filter: view.filter, trashed: view.trashed, limit: 50 },
      { getNextPageParam: (last) => last.nextCursor ?? undefined },
    ),
  );
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: trpc.notes.list.pathKey() });
    void qc.invalidateQueries({ queryKey: trpc.notes.counts.queryKey() });
  };
  const restore = useMutation(trpc.notes.restore.mutationOptions({ onSuccess: invalidate }));
  const purge = useMutation(trpc.notes.purge.mutationOptions({ onSuccess: invalidate }));

  // Поиск с задержкой: адрес меняется не на каждую букву.
  useEffect(() => {
    const t = setTimeout(() => {
      const q = text.trim() || undefined;
      if (q !== view.filter.text) setView((v) => ({ ...v, filter: { ...v.filter, text: q } }));
    }, 300);
    return () => clearTimeout(t);
  }, [text, view.filter.text, setView]);

  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const qs = query ? `?${query}` : '';
  return (
    <div className="grid min-w-0 content-start gap-2">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={N.searchPlaceholder}
          aria-label={N.searchPlaceholder}
          className="pl-8"
          data-testid="notes-search"
        />
      </div>
      <div className="flex items-center gap-2">
        <Select value={view.filter.sort} onValueChange={(s) => setView((v) => ({ ...v, filter: { ...v.filter, sort: s as NotesView['filter']['sort'] } }))}>
          <SelectTrigger size="sm" className="flex-1" aria-label={N.sort}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {NOTE_SORTS.map((s) => (
              <SelectItem key={s} value={s}>
                {N.sorts[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {campaignId && !view.trashed && (
          <Button
            size="sm"
            variant={compare ? 'secondary' : 'outline'}
            onClick={() => setCompare((c) => (c ? null : []))}
            aria-pressed={!!compare}
            data-testid="compare-toggle"
          >
            <ColumnsIcon />
            {N.compare}
          </Button>
        )}
      </div>
      {compare && (
        <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-2 py-1.5 text-xs">
          <span>{compare.length ? `${compare.length} / 3` : N.compareHint}</span>
          <Button
            size="sm"
            disabled={compare.length < 2}
            onClick={() => router.push(`/campaigns/${campaignId}/notes/compare?ids=${compare.join(',')}`)}
            data-testid="compare-go"
          >
            {N.compare}
          </Button>
        </div>
      )}
      {view.trashed && <p className="px-1 text-xs text-muted-foreground">{N.trashHint}</p>}
      <ul className="grid gap-1" data-testid="notes-list">
        {items.map((n) => {
          const Vis = VIS_ICON[n.visibility];
          const checked = compare?.includes(n.id) ?? false;
          return (
            <li key={n.id} className="flex items-start gap-2">
              {compare && (
                <Checkbox
                  className="mt-3"
                  checked={checked}
                  disabled={!checked && compare.length >= 3}
                  aria-label={`${N.compareAdd}: ${n.title || N.untitled}`}
                  onCheckedChange={(v) => setCompare((c) => (v ? [...(c ?? []), n.id] : (c ?? []).filter((x) => x !== n.id)))}
                />
              )}
              <div
                className={cn(
                  'grid min-w-0 flex-1 gap-1 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-accent/60',
                  selectedId === n.id && 'border-primary bg-accent',
                )}
              >
                {view.trashed ? (
                  <span className="truncate font-medium">{n.title || N.untitled}</span>
                ) : (
                  <Link href={`${base}/${n.id}${qs}`} className="truncate font-medium hover:underline" data-testid="note-link">
                    {n.title || N.untitled}
                  </Link>
                )}
                <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  <Badge variant="outline" className="h-5 px-1.5 text-[11px]">
                    {N.types[n.type]}
                  </Badge>
                  {n.sessionNo !== null && <span>{N.sessionShort(n.sessionNo)}</span>}
                  <Vis className="size-3" aria-label={N.visibilities[n.visibility]} />
                  {n.pinned && <PinIcon className="size-3" aria-label={N.pinned} />}
                  {n.isHandout && <InboxIcon className="size-3" aria-label={N.handout} />}
                  {n.tags.map((t) => (
                    <span key={t.id} className="inline-flex items-center gap-1">
                      <span className="size-2 rounded-full" style={{ backgroundColor: t.color }} aria-hidden />
                      {t.name}
                    </span>
                  ))}
                  <span className="ml-auto">{formatDate(n.updatedAt)}</span>
                </div>
                {n.snippet && <Snippet text={n.snippet} className="line-clamp-2 text-xs text-muted-foreground" />}
                {view.trashed && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => restore.mutate({ noteId: n.id })}>
                      <RotateCcwIcon />
                      {N.restore}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (window.confirm(N.purgeConfirm)) purge.mutate({ noteId: n.id });
                      }}
                    >
                      <Trash2Icon />
                      {N.purge}
                    </Button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {!list.isLoading && items.length === 0 && (
        <p className="px-1 py-6 text-center text-sm text-muted-foreground">{view.filter.text ? N.notFound : N.empty}</p>
      )}
      {list.hasNextPage && (
        <Button variant="ghost" size="sm" onClick={() => void list.fetchNextPage()} disabled={list.isFetchingNextPage}>
          {ru.common.more}
        </Button>
      )}
    </div>
  );
}
