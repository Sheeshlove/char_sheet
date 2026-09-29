'use client';
import { ru } from '@/i18n/ru';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function HomeDashboard() {
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
          <CardTitle>{ru.home.myCampaigns}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">{ru.home.noCampaigns}</CardContent>
      </Card>
    </div>
  );
}
