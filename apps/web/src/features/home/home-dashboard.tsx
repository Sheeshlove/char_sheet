'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc/client';
import { ru } from '@/i18n/ru';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function HomeDashboard() {
  const trpc = useTRPC();
  const campaigns = useQuery(trpc.campaigns.list.queryOptions());
  const active = campaigns.data?.filter((c) => !c.archivedAt) ?? [];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{ru.home.myCharacters}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">{ru.home.noCharacters}</CardContent>
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
    </div>
  );
}
