'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { SearchIcon } from 'lucide-react';
import { CONTENT_KINDS } from '@ps/content-schema';
import { SCHOOL_LABEL_RU } from '@ps/rules-engine';
import { useTRPC } from '@/lib/trpc/client';
import { ru } from '@/i18n/ru';
import { diceRu, formatCost, formatWeight } from '@/lib/format';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState, QueryState } from '@/components/query-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const L = ru.library;
const ALL = '__all';

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function entityHref(key: string, kind: string) {
  const [pack, , ...slug] = key.split('/');
  return `/library/${kind}/${pack}/${slug.join('/')}`;
}

function Summary({ kind, s }: { kind: string; s: Record<string, string | number | boolean> }) {
  const parts: string[] = [];
  if (kind === 'weapon') parts.push(`${diceRu(String(s.damage))}`, formatCost(Number(s.costCp)), formatWeight(Number(s.weightLb)));
  if (kind === 'armor') parts.push(`${L.ac} ${s.baseAc}`, formatCost(Number(s.costCp)), formatWeight(Number(s.weightLb)));
  if (kind === 'gear' || kind === 'tool') parts.push(formatCost(Number(s.costCp)), formatWeight(Number(s.weightLb)));
  if (kind === 'spell') {
    parts.push(Number(s.level) === 0 ? L.cantrip : `${s.level} ${L.level.toLowerCase()}`, SCHOOL_LABEL_RU[String(s.school)] ?? '');
    if (s.ritual) parts.push(L.ritual);
    if (s.concentration) parts.push(L.concentration);
  }
  if (kind === 'item') parts.push(L.itemTypes[String(s.itemType)] ?? '', L.rarities[String(s.rarity)] ?? '');
  if (kind === 'class') parts.push(`${L.hitDie} к${s.hitDie}`);
  return <span className="text-xs text-muted-foreground">{parts.filter(Boolean).join(' · ')}</span>;
}

export function LibraryList() {
  const trpc = useTRPC();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const kind = params.get('kind') ?? ALL;
  const pack = params.get('pack') ?? ALL;
  const source = params.get('source') ?? ALL;
  const dq = useDebounced(q);

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params.toString());
    if (v === ALL || !v) next.delete(k);
    else next.set(k, v);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  useEffect(() => {
    if ((params.get('q') ?? '') !== dq) setParam('q', dq);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq]);

  const facets = useQuery(trpc.content.facets.queryOptions());
  const input = {
    kind: kind === ALL ? undefined : (kind as (typeof CONTENT_KINDS)[number]),
    pack: pack === ALL ? undefined : pack,
    source: source === ALL ? undefined : source,
    q: dq || undefined,
    limit: 50,
  };
  const list = useInfiniteQuery(
    trpc.content.list.infiniteQueryOptions(input, { getNextPageParam: (last) => last.nextCursor ?? undefined }),
  );
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <PageHeader title={L.title} />
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_12rem_12rem_12rem]">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={L.search}
            className="pl-9"
            aria-label={L.search}
            data-testid="library-search"
          />
        </div>
        <Select value={kind} onValueChange={(v) => setParam('kind', v)}>
          <SelectTrigger aria-label={L.kind} data-testid="library-kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{L.allKinds}</SelectItem>
            {CONTENT_KINDS.filter((k) => k !== 'feature').map((k) => (
              <SelectItem key={k} value={k}>
                {L.kinds[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={pack} onValueChange={(v) => setParam('pack', v)}>
          <SelectTrigger aria-label={L.pack}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{L.allPacks}</SelectItem>
            {facets.data?.packs.map((p) => (
              <SelectItem key={p.key} value={p.key}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={source} onValueChange={(v) => setParam('source', v)}>
          <SelectTrigger aria-label={L.source}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{L.allSources}</SelectItem>
            {facets.data?.sources.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <QueryState isLoading={list.isLoading} error={list.error}>
        {items.length === 0 ? (
          <EmptyState>{L.nothing}</EmptyState>
        ) : (
          <ul className="divide-y rounded-lg border" data-testid="library-list">
            {items.map((e) => (
              <li key={e.key}>
                <Link
                  href={entityHref(e.key, e.kind)}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2.5 hover:bg-accent/50 pointer-coarse:py-3"
                >
                  <div className="min-w-0">
                    <div className="font-medium">{e.nameRu}</div>
                    <Summary kind={e.kind} s={e.summary} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline">{L.kindOne[e.kind]}</Badge>
                    {e.sourceBook && <Badge variant="secondary">{e.sourceBook}</Badge>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {list.hasNextPage && (
          <div className="mt-3 flex justify-center">
            <Button variant="outline" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
              {L.loadMore}
            </Button>
          </div>
        )}
      </QueryState>
    </>
  );
}
