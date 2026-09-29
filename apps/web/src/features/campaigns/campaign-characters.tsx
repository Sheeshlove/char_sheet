'use client';
import { ru } from '@/i18n/ru';
import { EmptyState } from '@/components/query-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/** Персонажи кампании — наполняется в M7. */
export function CampaignCharacters(_props: { campaignId: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{ru.campaigns.characters}</CardTitle>
      </CardHeader>
      <CardContent>
        <EmptyState>{ru.home.noCharacters}</EmptyState>
      </CardContent>
    </Card>
  );
}
