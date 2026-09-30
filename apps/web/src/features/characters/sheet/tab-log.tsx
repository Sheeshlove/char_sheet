'use client';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ru } from '@/i18n/ru';
import { useTRPC } from '@/lib/trpc/client';
import { formatDateTime } from '@/lib/utils';
import { QueryState } from '@/components/query-state';
import { Button } from '@/components/ui/button';
import { Section } from './bits';
import { useSheet } from './context';

const L = ru.sheet.log;

type Payload = {
  command?: { type?: string; amount?: number; level?: number; id?: string; on?: boolean };
  changed?: string[];
  level?: number;
};

function describe(kind: string, payload: unknown): string {
  const p = (payload ?? {}) as Payload;
  const c = p.command;
  if (kind === 'state.command' && c?.type) {
    const name = L.commands[c.type] ?? c.type;
    if (c.amount !== undefined) return `${name}: ${c.amount}`;
    if (c.type === 'spend_slot' || c.type === 'restore_slot') return `${name}: ${L.slotLevel(c.level ?? 0)}`;
    if (c.type === 'set_toggle') return `${name}: ${c.id?.replace(/^spell:.*\//, '') ?? ''} ${c.on ? L.on : L.off}`;
    return name;
  }
  if (kind === 'build.level_up' && p.level) return `${L.kinds[kind]}: ${p.level}`;
  if (kind === 'build.update' && p.changed?.length) return L.changed(p.changed.map((k) => L.buildParts[k] ?? k).join(', '));
  return L.kinds[kind] ?? kind;
}

/** Журнал изменений персонажа (SPEC §4.3 `character_events`). */
export function TabLog() {
  const { characterId } = useSheet();
  const trpc = useTRPC();
  const q = useInfiniteQuery(
    trpc.characters.events.infiniteQueryOptions({ characterId, limit: 30 }, { getNextPageParam: (last) => last.nextCursor }),
  );
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <Section title={ru.sheet.tabs.log}>
      <QueryState isLoading={q.isLoading} error={q.error}>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{L.empty}</p>
        ) : (
          <ul className="grid gap-1 text-sm" data-testid="event-log">
            {items.map((e) => (
              <li key={e.id} className="flex flex-wrap justify-between gap-2 border-b py-1 last:border-0">
                <span>{describe(e.kind, e.payload)}</span>
                <span className="text-xs text-muted-foreground">
                  {e.actorName ?? '—'} · {formatDateTime(e.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {q.hasNextPage && (
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void q.fetchNextPage()} disabled={q.isFetchingNextPage}>
            {L.more}
          </Button>
        )}
      </QueryState>
    </Section>
  );
}
