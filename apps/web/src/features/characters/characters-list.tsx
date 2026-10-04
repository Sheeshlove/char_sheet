'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { useTRPC } from '@/lib/trpc/client';
import { ru } from '@/i18n/ru';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState, QueryState } from '@/components/query-state';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { CharacterCard } from './character-card';

export function CharactersList() {
  const trpc = useTRPC();
  const [archived, setArchived] = useState(false);
  const list = useQuery(trpc.characters.listMine.queryOptions({ archived }));
  return (
    <>
      <PageHeader
        title={ru.characters.title}
        actions={
          <Button asChild>
            <Link href="/characters/new">
              <PlusIcon />
              {ru.characters.create}
            </Link>
          </Button>
        }
      />
      <Label className="mb-4 w-fit font-normal">
        <Switch checked={archived} onCheckedChange={setArchived} />
        {ru.characters.showArchived}
      </Label>
      <QueryState isLoading={list.isLoading} error={list.error}>
        {!list.data?.length ? (
          <EmptyState>{ru.characters.none}</EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="character-list">
            {list.data.map((c) => (
              <CharacterCard
                key={c.id}
                c={{ ...c, subtitle: c.campaignName ?? ru.characters.noCampaign, archived: !!c.archivedAt }}
              />
            ))}
          </div>
        )}
      </QueryState>
    </>
  );
}
