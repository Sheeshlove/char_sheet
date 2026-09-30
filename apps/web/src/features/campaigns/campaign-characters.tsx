'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { useTRPC } from '@/lib/trpc/client';
import { ru } from '@/i18n/ru';
import { EmptyState, QueryState } from '@/components/query-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CharacterCard } from '@/features/characters/character-card';

/** Персонажи кампании с учётом видимости листов (SPEC §5.3). */
export function CampaignCharacters({ campaignId }: { campaignId: string }) {
  const trpc = useTRPC();
  const list = useQuery(trpc.characters.listByCampaign.queryOptions({ campaignId }));
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>{ru.campaigns.characters}</CardTitle>
        <Button asChild size="sm" variant="outline">
          <Link href={`/characters/new?campaign=${campaignId}`}>
            <PlusIcon />
            {ru.characters.create}
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        <QueryState isLoading={list.isLoading} error={list.error}>
          {!list.data?.length ? (
            <EmptyState>{ru.characters.campaignCharactersNone}</EmptyState>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2" data-testid="campaign-characters">
              {list.data.map((c) => (
                <CharacterCard
                  key={c.id}
                  c={{ ...c, subtitle: `${ru.characters.owner}: ${c.ownerName}` }}
                  href={c.status === 'draft' && c.isMine ? `/characters/${c.id}/build` : `/characters/${c.id}`}
                />
              ))}
            </div>
          )}
        </QueryState>
      </CardContent>
    </Card>
  );
}
