'use client';
import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { parseCampaignSettings } from '@ps/content-schema';
import { useTRPC } from '@/lib/trpc/client';
import { ru } from '@/i18n/ru';
import { QueryState } from '@/components/query-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NotesHeader } from '@/features/notes/notes-screen';
import { DiceRoller } from '@/features/rolls/dice-roller';
import { HomebrewReview } from '@/features/homebrew/homebrew-review';
import { BulkActions } from './bulk-actions';
import { CampaignLog } from './campaign-log';
import { PartyTable } from './party-table';

const G = ru.gm;
const TABS = ['party', 'log', 'rolls', 'homebrew'] as const;
type Tab = (typeof TABS)[number];

/** Панель мастера (SPEC §13): таблица персонажей, массовые действия, журнал, броски, homebrew. */
export function GmPanel({ campaignId }: { campaignId: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab: Tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as Tab) : 'party';
  const campaign = useQuery(trpc.campaigns.get.queryOptions({ campaignId }));
  const party = useQuery({ ...trpc.characters.listByCampaign.queryOptions({ campaignId }), refetchInterval: 5000 });
  const [selected, setSelected] = useState<string[]>([]);
  const isGm = campaign.data?.role === 'gm' || campaign.data?.role === 'co_gm';
  const rows = (party.data ?? []).filter((c) => c.status === 'ready').map((c) => ({ id: c.id, name: c.name, ownerName: c.ownerName, summary: c.summary }));
  const milestone = parseCampaignSettings(campaign.data?.settings).leveling === 'milestone';
  // Выбор не должен ссылаться на ушедших из кампании персонажей.
  const liveSelected = selected.filter((id) => rows.some((r) => r.id === id));

  return (
    <>
      <NotesHeader campaignId={campaignId} section="gm" />
      <QueryState isLoading={campaign.isLoading} error={campaign.error}>
        {!isGm ? (
          <p role="alert" className="text-sm text-muted-foreground">
            {ru.errors.FORBIDDEN}
          </p>
        ) : (
          <Tabs value={tab} onValueChange={(t) => router.replace(`${pathname}?tab=${t}`, { scroll: false })}>
            <TabsList className="w-auto self-start">
              {TABS.map((t) => (
                <TabsTrigger key={t} value={t}>
                  {G.tabs[t]}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="party" className="grid gap-4">
              {rows.length === 0 && !party.isLoading ? (
                <p className="text-sm text-muted-foreground">{G.empty}</p>
              ) : (
                <>
                  <BulkActions campaignId={campaignId} selected={liveSelected} milestone={milestone} />
                  <PartyTable rows={rows} selected={liveSelected} onSelect={setSelected} />
                </>
              )}
            </TabsContent>
            <TabsContent value="log">
              <CampaignLog campaignId={campaignId} characters={rows.map((r) => ({ id: r.id, name: r.name }))} />
            </TabsContent>
            <TabsContent value="rolls">
              <DiceRoller campaignId={campaignId} />
            </TabsContent>
            <TabsContent value="homebrew">
              <HomebrewReview campaignId={campaignId} />
            </TabsContent>
          </Tabs>
        )}
      </QueryState>
    </>
  );
}
