'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { useTRPC } from '@/lib/trpc/client';
import { ru } from '@/i18n/ru';
import { formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const H = ru.homebrew;
const MINE = '__mine';

/** `/homebrew`: мои сущности и homebrew кампаний (SPEC §14). */
export function HomebrewList() {
  const trpc = useTRPC();
  const campaigns = useQuery(trpc.campaigns.list.queryOptions());
  const [scope, setScope] = useState(MINE);
  const list = useQuery(
    trpc.homebrew.list.queryOptions(scope === MINE ? { scope: 'mine' } : { scope: 'campaign', campaignId: scope }),
  );
  const active = campaigns.data?.filter((c) => !c.archivedAt) ?? [];
  return (
    <>
      <PageHeader
        title={H.title}
        description={H.subtitle}
        actions={
          <Button asChild data-testid="hb-new">
            <Link href={scope === MINE ? '/homebrew/new' : `/homebrew/new?campaign=${scope}`}>
              <PlusIcon />
              {H.new}
            </Link>
          </Button>
        }
      />
      <Select value={scope} onValueChange={setScope}>
        <SelectTrigger className="mb-3 w-72" aria-label={H.campaign}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={MINE}>{H.mine}</SelectItem>
          {active.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {H.targetCampaign(c.name)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {list.data && !list.data.length && <p className="text-sm text-muted-foreground">{H.empty}</p>}
      <ul className="grid gap-2" data-testid="hb-list">
        {list.data?.map((e) => (
          <li key={e.key}>
            <Link href={`/homebrew/${e.key}/edit`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 hover:bg-accent/50">
              <span className="font-medium">{e.nameRu}</span>
              <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{H.kinds[e.kind]}</Badge>
                <Badge variant={e.status === 'approved' ? 'secondary' : 'outline'}>{H.status[e.status]}</Badge>
                {e.campaignName ?? H.targetPersonal}
                {scope !== MINE && e.authorName && ` · ${H.by(e.authorName)}`}
                <span>{formatDate(e.updatedAt)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
