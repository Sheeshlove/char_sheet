'use client';
import { useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc/client';
import { ru } from '@/i18n/ru';
import { formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { describeEvent } from '@/features/characters/sheet/tab-log';

const G = ru.gm;
const ALL = '__all';

/** Журнал кампании (SPEC §13): события персонажей с фильтрами по персонажу, типу, автору и дате. */
export function CampaignLog({ campaignId, characters }: { campaignId: string; characters: { id: string; name: string }[] }) {
  const trpc = useTRPC();
  const members = useQuery(trpc.campaigns.members.list.queryOptions({ campaignId }));
  const [characterId, setCharacterId] = useState(ALL);
  const [kind, setKind] = useState(ALL);
  const [actorId, setActorId] = useState(ALL);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const q = useInfiniteQuery({
    ...trpc.characters.campaignEvents.infiniteQueryOptions(
      {
        campaignId,
        limit: 50,
        ...(characterId !== ALL ? { characterId } : {}),
        ...(kind !== ALL ? { kind } : {}),
        ...(actorId !== ALL ? { actorId } : {}),
        ...(from ? { from: new Date(`${from}T00:00:00`) } : {}),
        ...(to ? { to: new Date(`${to}T23:59:59`) } : {}),
      },
      { getNextPageParam: (last) => last.nextCursor },
    ),
    refetchInterval: 5000,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const select = (label: string, value: string, set: (v: string) => void, options: { value: string; label: string }[]) => (
    <div className="grid gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={set}>
        <SelectTrigger size="sm" className="w-44" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{G.logFilters.all}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-2">
        {select(G.logFilters.character, characterId, setCharacterId, characters.map((c) => ({ value: c.id, label: c.name })))}
        {select(
          G.logFilters.kind,
          kind,
          setKind,
          Object.entries(ru.sheet.log.kinds).map(([value, label]) => ({ value, label })),
        )}
        {select(G.logFilters.author, actorId, setActorId, (members.data ?? []).map((m) => ({ value: m.userId, label: m.displayName })))}
        <div className="grid gap-1">
          <Label htmlFor="log-from" className="text-xs text-muted-foreground">
            {G.logFilters.from}
          </Label>
          <Input id="log-from" type="date" className="h-8 w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="log-to" className="text-xs text-muted-foreground">
            {G.logFilters.to}
          </Label>
          <Input id="log-to" type="date" className="h-8 w-40" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>
      <ul className="grid gap-1 text-sm" data-testid="campaign-log">
        {!q.isLoading && !items.length && <li className="text-muted-foreground">{G.logEmpty}</li>}
        {items.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-1.5 last:border-0">
            <span>
              <span className="font-medium">{e.characterName}</span>: {describeEvent(e.kind, e.payload)}
            </span>
            <span className="text-xs text-muted-foreground">
              {e.actorName ?? '—'} · {formatDateTime(e.createdAt)}
            </span>
          </li>
        ))}
      </ul>
      {q.hasNextPage && (
        <Button variant="outline" size="sm" onClick={() => void q.fetchNextPage()} disabled={q.isFetchingNextPage}>
          {ru.common.more}
        </Button>
      )}
    </div>
  );
}
