'use client';
import { SIZE_LABEL_RU } from '@ps/rules-engine';
import { ru } from '@/i18n/ru';
import { selectable } from '@/lib/content/use-content';
import { formatFeet } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChoicesBlock, EntityPicker, FeatureList } from './shared';
import type { StepProps } from './types';

const B = ru.builder;

export function RaceStep({ build, update, onChoice, content, sheet }: StepProps) {
  const races = selectable(content, 'race');
  const race = build.race ? content.index.getOf(build.race, 'race') : undefined;
  const subraces = race ? selectable(content, 'subrace').filter((s) => s.data.raceKey === race.key) : [];
  const subrace = build.subrace ? content.index.getOf(build.subrace, 'subrace') : undefined;
  const choices = sheet.choices.filter((c) => c.kind === 'choice' && (c.sourceKey === build.race || c.sourceKey === build.subrace));
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{B.chooseRace}</CardTitle>
        </CardHeader>
        <CardContent>
          <EntityPicker
            label={B.chooseRace}
            items={races}
            selected={build.race}
            onSelect={(key) => update((b) => ({ ...b, race: key, subrace: undefined }))}
            describe={(r) => `${SIZE_LABEL_RU[r.data.size]} · ${formatFeet(r.data.speed.walk)}`}
          />
        </CardContent>
      </Card>
      {race && subraces.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{B.subrace}</CardTitle>
          </CardHeader>
          <CardContent>
            <EntityPicker
              label={B.subrace}
              items={subraces}
              selected={build.subrace}
              onSelect={(key) => update((b) => ({ ...b, subrace: key }))}
            />
          </CardContent>
        </Card>
      )}
      {race && (
        <Card>
          <CardHeader>
            <CardTitle>
              {race.nameRu}
              {subrace ? ` · ${subrace.nameRu}` : ''}: {B.features.toLowerCase()}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            <p className="text-sm text-muted-foreground">
              {B.size}: {SIZE_LABEL_RU[race.data.size]} · {B.speed}: {formatFeet(race.data.speed.walk)}
            </p>
            <FeatureList features={[...race.data.features, ...(subrace?.data.features ?? [])]} statusLabels={ru.sheet.automated} />
          </CardContent>
        </Card>
      )}
      <ChoicesBlock title={B.choicesFor(race?.nameRu ?? '')} choices={choices} onChoice={onChoice} />
    </>
  );
}
