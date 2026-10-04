'use client';
import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueries } from '@tanstack/react-query';
import { XIcon } from 'lucide-react';
import { useTRPC } from '@/lib/trpc/client';
import { ru } from '@/i18n/ru';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { NoteRender } from './note-render';
import { NotesHeader } from './notes-screen';

const N = ru.notes;

/** Сравнение до трёх заметок (§11.4): колонки, синхронная прокрутка, общие теги и ссылки. */
export function NotesCompare({ campaignId, ids }: { campaignId: string; ids: string[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const queries = useQueries({ queries: ids.map((noteId) => trpc.notes.get.queryOptions({ noteId })) });
  const notes = queries.map((q) => q.data).filter((n): n is NonNullable<typeof n> => !!n);
  const [sync, setSync] = useState(true);
  const cols = useRef<(HTMLDivElement | null)[]>([]);
  const syncing = useRef(false);

  const { commonTags, commonLinks } = useMemo(() => {
    const count = new Map<string, number>();
    const tagInfo = new Map<string, { name: string; color: string }>();
    const linkCount = new Map<string, number>();
    const linkInfo = new Map<string, string>();
    for (const n of notes) {
      for (const t of n.tags) {
        count.set(t.id, (count.get(t.id) ?? 0) + 1);
        tagInfo.set(t.id, t);
      }
      const own = new Set<string>();
      // Заметки из сравнения тоже считаются общими целями, если на них ссылаются другие.
      for (const l of n.links) own.add(`${l.targetType}:${l.targetId}`);
      for (const k of own) linkCount.set(k, (linkCount.get(k) ?? 0) + 1);
      for (const l of n.links) linkInfo.set(`${l.targetType}:${l.targetId}`, l.label);
    }
    return {
      commonTags: [...count].filter(([, c]) => c >= 2).map(([id]) => ({ id, ...tagInfo.get(id)! })),
      commonLinks: [...linkCount].filter(([, c]) => c >= 2).map(([key]) => ({ key, label: linkInfo.get(key) ?? key })),
    };
  }, [notes]);
  const commonTagIds = new Set(commonTags.map((t) => t.id));
  const commonLinkKeys = new Set(commonLinks.map((l) => l.key));

  const onScroll = (i: number) => {
    if (!sync || syncing.current) return;
    const src = cols.current[i];
    if (!src) return;
    const ratio = src.scrollTop / Math.max(1, src.scrollHeight - src.clientHeight);
    syncing.current = true;
    cols.current.forEach((el, j) => {
      if (el && j !== i) el.scrollTop = ratio * (el.scrollHeight - el.clientHeight);
    });
    requestAnimationFrame(() => {
      syncing.current = false;
    });
  };
  const remove = (id: string) => {
    const rest = ids.filter((x) => x !== id);
    router.replace(rest.length ? `/campaigns/${campaignId}/notes/compare?ids=${rest.join(',')}` : `/campaigns/${campaignId}/notes`);
  };

  return (
    <>
      <NotesHeader campaignId={campaignId} section="notes" />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{N.compareTitle}</h2>
        <Label className="font-normal">
          <Switch checked={sync} onCheckedChange={setSync} />
          {N.syncScroll}
        </Label>
      </div>
      {(commonTags.length > 0 || commonLinks.length > 0) && (
        <div className="mb-3 grid gap-2 rounded-lg border p-3 text-sm" data-testid="compare-common">
          {commonTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground">{N.commonTags}:</span>
              {commonTags.map((t) => (
                <span key={t.id} className="inline-flex items-center gap-1 rounded-full border border-primary px-2 py-0.5 text-xs">
                  <span className="size-2 rounded-full" style={{ backgroundColor: t.color }} aria-hidden />
                  {t.name}
                </span>
              ))}
            </div>
          )}
          {commonLinks.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground">{N.commonLinks}:</span>
              {commonLinks.map((l) => (
                <Badge key={l.key} variant="secondary">
                  {l.label}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}
      {!ids.length && <p className="text-sm text-muted-foreground">{N.compareHint}</p>}
      <div className={cn('grid gap-3', ids.length === 2 && 'md:grid-cols-2', ids.length >= 3 && 'md:grid-cols-3')} data-testid="compare-columns">
        {ids.map((id, i) => {
          const n = queries[i]?.data;
          return (
            <section key={id} className="flex min-w-0 flex-col rounded-lg border">
              <header className="flex items-start justify-between gap-2 border-b p-3">
                <div className="min-w-0">
                  {n ? (
                    <Link href={`/campaigns/${campaignId}/notes/${id}`} className="font-semibold hover:underline">
                      {n.title || N.untitled}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">{queries[i]?.error ? ru.errors.NOT_FOUND : ru.common.loading}</span>
                  )}
                  {n && (
                    <div className="mt-1 flex flex-wrap items-center gap-1 text-xs">
                      <Badge variant="outline">{N.types[n.type]}</Badge>
                      {n.tags.map((t) => (
                        <span
                          key={t.id}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full border px-1.5',
                            commonTagIds.has(t.id) ? 'border-primary font-medium' : 'border-transparent text-muted-foreground',
                          )}
                        >
                          <span className="size-2 rounded-full" style={{ backgroundColor: t.color }} aria-hidden />
                          {t.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <Button size="icon-sm" variant="ghost" aria-label={N.removeFromCompare} onClick={() => remove(id)}>
                  <XIcon />
                </Button>
              </header>
              <div
                ref={(el) => {
                  cols.current[i] = el;
                }}
                onScroll={() => onScroll(i)}
                className="max-h-[70vh] overflow-y-auto p-3"
              >
                {n && <NoteRender doc={n.body} campaignId={campaignId} highlight={commonLinkKeys} />}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
