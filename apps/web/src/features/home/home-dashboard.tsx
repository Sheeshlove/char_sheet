'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { useTRPC } from '@/lib/trpc/client';
import { ru } from '@/i18n/ru';
import { formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CharacterCard } from '@/features/characters/character-card';

const noteHref = (n: { id: string; campaignId: string | null }) => (n.campaignId ? `/campaigns/${n.campaignId}/notes/${n.id}` : `/notes/${n.id}`);

/** Главная (SPEC §12): мои персонажи, мои кампании, последние заметки, раздаточные материалы. */
export function HomeDashboard() {
  const trpc = useTRPC();
  const campaigns = useQuery(trpc.campaigns.list.queryOptions());
  const characters = useQuery(trpc.characters.listMine.queryOptions());
  const recent = useQuery(trpc.notes.recent.queryOptions({ limit: 6 }));
  const handouts = useQuery(trpc.notes.handouts.queryOptions({}));
  const active = campaigns.data?.filter((c) => !c.archivedAt) ?? [];
  const chars = characters.data?.filter((c) => !c.archivedAt).slice(0, 4) ?? [];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="md:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>
            <Link href="/characters" className="hover:underline">
              {ru.home.myCharacters}
            </Link>
          </CardTitle>
          <Button size="sm" variant="outline" asChild>
            <Link href="/characters/new">
              <PlusIcon />
              {ru.home.createCharacter}
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {chars.length === 0 ? (
            <p className="text-sm text-muted-foreground">{ru.home.noCharacters}</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {chars.map((c) => (
                <CharacterCard key={c.id} c={{ ...c, subtitle: c.campaignName ?? undefined }} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            <Link href="/campaigns" className="hover:underline">
              {ru.home.myCampaigns}
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {active.length === 0 ? (
            <p className="text-sm text-muted-foreground">{ru.home.noCampaigns}</p>
          ) : (
            <ul className="grid gap-1">
              {active.map((c) => (
                <li key={c.id}>
                  <Link href={`/campaigns/${c.id}`} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-accent">
                    <span className="truncate">{c.name}</span>
                    <Badge variant="outline">{ru.campaigns.roles[c.role]}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {ru.home.handouts}
            {handouts.data?.unread ? <Badge data-testid="handouts-unread">{handouts.data.unread}</Badge> : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {handouts.data?.items.length ? (
            <ul className="grid gap-1" data-testid="home-handouts">
              {handouts.data.items.slice(0, 8).map((h) => (
                <li key={h.id}>
                  <Link href={noteHref(h)} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-accent">
                    <span className={h.readAt ? 'truncate' : 'truncate font-semibold'}>{h.title || ru.notes.untitled}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {h.readAt ? h.campaignName : ru.notes.unread}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{ru.home.noHandouts}</p>
          )}
        </CardContent>
      </Card>
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>
            <Link href="/notes" className="hover:underline">
              {ru.home.recentNotes}
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recent.data?.length ? (
            <ul className="grid gap-1 sm:grid-cols-2">
              {recent.data.map((n) => (
                <li key={n.id}>
                  <Link href={noteHref(n)} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-accent">
                    <span className="truncate">{n.title || ru.notes.untitled}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {n.campaignName ?? ru.notes.personalTitle} · {formatDate(n.updatedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{ru.home.noNotes}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
