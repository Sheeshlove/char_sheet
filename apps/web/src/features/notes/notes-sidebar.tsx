'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookmarkIcon, InboxIcon, PinIcon, PlusIcon, SaveIcon, Trash2Icon, XIcon } from 'lucide-react';
import { useTRPC } from '@/lib/trpc/client';
import { ru } from '@/i18n/ru';
import { NOTE_TYPES, TAG_COLORS } from '@/lib/notes/schema';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { EMPTY_VIEW, type NotesView } from './use-notes-filter';

const N = ru.notes;

export function notesBase(campaignId: string | null) {
  return campaignId ? `/campaigns/${campaignId}/notes` : '/notes';
}

function Item({
  active,
  onClick,
  children,
  count,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      className={cn(
        'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent pointer-coarse:py-2.5',
        active && 'bg-accent font-medium',
      )}
    >
      <span className="flex min-w-0 items-center gap-2 truncate">{children}</span>
      {count !== undefined && <span className="text-xs text-muted-foreground tabular-nums">{count}</span>}
    </button>
  );
}

function Heading({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mt-3 mb-1 flex items-center justify-between px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
      {children}
      {action}
    </div>
  );
}

/** Левая панель (§11.3): типы, теги, сохранённые фильтры, закреплённые, раздаточные, корзина. */
export function NotesSidebar({
  campaignId,
  view,
  setView,
}: {
  campaignId: string | null;
  view: NotesView;
  setView: (v: NotesView | ((v: NotesView) => NotesView)) => void;
}) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const counts = useQuery(trpc.notes.counts.queryOptions({ campaignId }));
  const tags = useQuery(trpc.tags.list.queryOptions({ campaignId }));
  const filters = useQuery(trpc.filters.list.queryOptions({ campaignId }));
  const saveFilter = useMutation(
    trpc.filters.save.mutationOptions({ onSuccess: () => qc.invalidateQueries({ queryKey: trpc.filters.list.queryKey() }) }),
  );
  const deleteFilter = useMutation(
    trpc.filters.delete.mutationOptions({ onSuccess: () => qc.invalidateQueries({ queryKey: trpc.filters.list.queryKey() }) }),
  );
  const [filterName, setFilterName] = useState('');
  const f = view.filter;
  const selectedTags = [...f.tagsAll, ...f.tagsAny];
  const total = Object.values(counts.data ?? {}).reduce((a, b) => a + (b ?? 0), 0);
  const plain = !view.trashed && !f.pinned && !f.handouts;
  const set = (patch: Partial<NotesView['filter']>, extra: Partial<NotesView> = {}) =>
    setView((v) => ({ ...v, ...extra, filter: { ...v.filter, ...patch } }));
  const toggleTag = (id: string) => {
    const next = selectedTags.includes(id) ? selectedTags.filter((t) => t !== id) : [...selectedTags, id];
    set(view.tagMode === 'any' ? { tagsAny: next, tagsAll: [] } : { tagsAll: next, tagsAny: [] });
  };
  return (
    <nav className="grid content-start gap-0.5" aria-label={N.title} data-testid="notes-sidebar">
      <Item
        active={plain && !f.types.length}
        onClick={() => setView({ ...EMPTY_VIEW, filter: { ...EMPTY_VIEW.filter, text: f.text, sort: f.sort } })}
        count={total}
      >
        {N.allNotes}
      </Item>
      {NOTE_TYPES.map((t) => (
        <Item
          key={t}
          active={plain && f.types.length === 1 && f.types[0] === t}
          onClick={() => set({ types: f.types.length === 1 && f.types[0] === t ? [] : [t], pinned: undefined, handouts: undefined }, { trashed: false })}
          count={counts.data?.[t] ?? 0}
          testId={`notes-type-${t}`}
        >
          {N.typesPlural[t]}
        </Item>
      ))}
      <Item active={!!f.pinned} onClick={() => set({ pinned: f.pinned ? undefined : true, handouts: undefined }, { trashed: false })}>
        <PinIcon className="size-4" />
        {N.pinned}
      </Item>
      {campaignId && (
        <Item active={!!f.handouts} onClick={() => set({ handouts: f.handouts ? undefined : true, pinned: undefined }, { trashed: false })}>
          <InboxIcon className="size-4" />
          {N.handouts}
        </Item>
      )}
      <Item active={view.trashed} onClick={() => setView((v) => ({ ...v, trashed: !v.trashed }))} testId="notes-trash">
        <Trash2Icon className="size-4" />
        {N.trash}
      </Item>

      <Heading action={<TagCreate campaignId={campaignId} />}>{N.tags}</Heading>
      {tags.data?.length ? (
        <>
          <div className="flex flex-wrap gap-1 px-2" data-testid="notes-tags">
            {tags.data.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={selectedTags.includes(t.id)}
                onClick={() => toggleTag(t.id)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
                  selectedTags.includes(t.id) ? 'border-foreground bg-accent' : 'border-border',
                )}
              >
                <span className="size-2 rounded-full" style={{ backgroundColor: t.color }} aria-hidden />
                {t.name}
                <span className="text-muted-foreground">{t.n}</span>
              </button>
            ))}
          </div>
          {selectedTags.length > 1 && (
            <div className="mt-1 flex gap-1 px-2">
              {(['all', 'any'] as const).map((m) => (
                <Button
                  key={m}
                  size="sm"
                  variant={view.tagMode === m ? 'secondary' : 'ghost'}
                  className="h-7 text-xs"
                  onClick={() =>
                    setView((v) => ({
                      ...v,
                      tagMode: m,
                      filter: { ...v.filter, tagsAll: m === 'all' ? selectedTags : [], tagsAny: m === 'any' ? selectedTags : [] },
                    }))
                  }
                >
                  {N.tagsMode[m]}
                </Button>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="px-2 text-xs text-muted-foreground">{N.noTags}</p>
      )}

      <Heading
        action={
          <Popover>
            <PopoverTrigger asChild>
              <Button size="icon-sm" variant="ghost" aria-label={N.saveFilter} title={N.saveFilter}>
                <SaveIcon />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64">
              <form
                className="grid gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!filterName.trim()) return;
                  saveFilter.mutate({ campaignId, name: filterName.trim(), query: { ...f } });
                  setFilterName('');
                }}
              >
                <Input value={filterName} onChange={(e) => setFilterName(e.target.value)} placeholder={N.filterName} aria-label={N.filterName} maxLength={80} />
                <Button type="submit" size="sm" disabled={!filterName.trim()}>
                  {ru.common.save}
                </Button>
              </form>
            </PopoverContent>
          </Popover>
        }
      >
        {N.savedFilters}
      </Heading>
      {filters.data?.length ? (
        filters.data.map((sf) => (
          <div key={sf.id} className="group flex items-center">
            <Item
              active={false}
              onClick={() =>
                setView({ filter: sf.query, trashed: false, tagMode: sf.query.tagsAny.length ? 'any' : 'all' })
              }
            >
              <BookmarkIcon className="size-4" />
              {sf.name}
            </Item>
            <Button
              size="icon-sm"
              variant="ghost"
              className="opacity-60 group-hover:opacity-100"
              aria-label={ru.common.delete}
              onClick={() => deleteFilter.mutate({ filterId: sf.id })}
            >
              <XIcon />
            </Button>
          </div>
        ))
      ) : (
        <p className="px-2 text-xs text-muted-foreground">{N.noFilters}</p>
      )}
    </nav>
  );
}

function TagCreate({ campaignId }: { campaignId: string | null }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(TAG_COLORS[1]);
  const [open, setOpen] = useState(false);
  const create = useMutation(
    trpc.tags.create.mutationOptions({
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: trpc.tags.list.queryKey() });
        setName('');
        setOpen(false);
      },
    }),
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label={N.newTag} title={N.newTag}>
          <PlusIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <TagForm name={name} setName={setName} color={color} setColor={setColor} onSubmit={() => create.mutate({ campaignId, name: name.trim(), color })} />
      </PopoverContent>
    </Popover>
  );
}

export function TagForm({
  name,
  setName,
  color,
  setColor,
  onSubmit,
}: {
  name: string;
  setName: (v: string) => void;
  color: string;
  setColor: (v: string) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSubmit();
      }}
    >
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={N.tagName} aria-label={N.tagName} maxLength={40} />
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={N.tagName}>
        {TAG_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={color === c}
            aria-label={c}
            onClick={() => setColor(c)}
            className={cn('size-6 rounded-full border-2', color === c ? 'border-foreground' : 'border-transparent')}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <Button type="submit" size="sm" disabled={!name.trim()}>
        {ru.common.create}
      </Button>
    </form>
  );
}
