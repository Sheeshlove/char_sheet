'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { SearchIcon } from 'lucide-react';
import { useTRPC } from '@/lib/trpc/client';
import { ru } from '@/i18n/ru';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Snippet } from '@/features/notes/snippet';

const S = ru.notes.search;

type Result = { key: string; group: 'notes' | 'characters' | 'content'; label: string; hint?: string; snippet?: string; href: string };

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Глобальный поиск Ctrl/Cmd+K (§11.3): заметки, персонажи, справочник — одним списком по группам. */
export function GlobalSearch() {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const query = useDebounced(q.trim(), 200);
  const enabled = open && query.length >= 2;
  const notes = useQuery({ ...trpc.notes.search.queryOptions({ q: query || '-', limit: 8 }), enabled });
  const chars = useQuery({ ...trpc.characters.search.queryOptions({ q: query || '-', limit: 6 }), enabled });
  const content = useQuery({ ...trpc.content.search.queryOptions({ q: query || '-', limit: 8 }), enabled });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const results: Result[] = useMemo(() => {
    if (!enabled) return [];
    return [
      ...(notes.data ?? []).map((n) => ({
        key: `n:${n.id}`,
        group: 'notes' as const,
        label: n.title || ru.notes.untitled,
        hint: n.campaignName ?? ru.notes.personalTitle,
        snippet: n.snippet,
        href: n.campaignId ? `/campaigns/${n.campaignId}/notes/${n.id}` : `/notes/${n.id}`,
      })),
      ...(chars.data ?? []).map((c) => ({
        key: `c:${c.id}`,
        group: 'characters' as const,
        label: c.name,
        hint: c.campaignName ?? undefined,
        href: `/characters/${c.id}`,
      })),
      ...(content.data ?? []).map((e) => {
        const [pack, kind, ...slug] = e.key.split('/');
        return {
          key: `e:${e.key}`,
          group: 'content' as const,
          label: e.nameRu,
          hint: ru.library.kinds[e.kind],
          href: `/library/${kind}/${pack}/${slug.join('/')}`,
        };
      }),
    ];
  }, [enabled, notes.data, chars.data, content.data]);

  const go = (r: Result | undefined) => {
    if (!r) return;
    setOpen(false);
    setQ('');
    router.push(r.href);
  };
  const loading = enabled && (notes.isFetching || chars.isFetching || content.isFetching);
  let lastGroup: string | null = null;

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label={S.title} data-testid="global-search-open" className="text-muted-foreground">
        <SearchIcon />
        <span className="hidden md:inline">{S.title}</span>
        <kbd className="hidden rounded border px-1 text-[10px] md:inline">{S.hint}</kbd>
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setQ('');
        }}
      >
        <DialogContent className="top-[15%] max-w-xl translate-y-0 gap-0 p-0">
          <DialogTitle className="sr-only">{S.title}</DialogTitle>
          <div className="flex items-center gap-2 border-b px-3">
            <SearchIcon className="size-4 text-muted-foreground" aria-hidden />
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive((i) => Math.min(results.length - 1, i + 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((i) => Math.max(0, i - 1));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  go(results[active]);
                }
              }}
              placeholder={S.placeholder}
              aria-label={S.placeholder}
              className="h-12 flex-1 bg-transparent text-sm outline-none"
              data-testid="global-search-input"
            />
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-2" role="listbox" data-testid="global-search-results">
            {enabled && !loading && !results.length && <p className="px-2 py-6 text-center text-sm text-muted-foreground">{S.nothing}</p>}
            {results.map((r, i) => {
              const header = r.group !== lastGroup ? S.groups[r.group] : null;
              lastGroup = r.group;
              return (
                <div key={r.key}>
                  {header && <div className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">{header}</div>}
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(r)}
                    className={cn('grid w-full gap-0.5 rounded-md px-2 py-1.5 text-left text-sm', i === active && 'bg-accent')}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{r.label}</span>
                      {r.hint && <span className="shrink-0 text-xs text-muted-foreground">{r.hint}</span>}
                    </span>
                    {r.snippet && <Snippet text={r.snippet} className="line-clamp-1 text-xs text-muted-foreground" />}
                  </button>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
