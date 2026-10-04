'use client';
import { ABILITIES } from '@ps/content-schema';
import { ABILITY_SHORT_RU, type ComputedSheet } from '@ps/rules-engine';
import { ru } from '@/i18n/ru';
import { signed } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const S = ru.sheet;

/** Живой предпросмотр листа в конструкторе. */
export function BuilderPreview({ sheet }: { sheet: ComputedSheet }) {
  const stat = (label: string, value: React.ReactNode, testId?: string) => (
    <div className="grid rounded-md border p-2 text-center">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums" data-testid={testId}>
        {value}
      </span>
    </div>
  );
  return (
    <Card data-testid="builder-preview">
      <CardHeader>
        <CardTitle className="text-base">{ru.builder.preview}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid grid-cols-3 gap-2">
          {ABILITIES.map((a) => (
            <div key={a} className="grid rounded-md border p-2 text-center">
              <span className="text-[11px] text-muted-foreground">{ABILITY_SHORT_RU[a]}</span>
              <span className="font-semibold tabular-nums">{sheet.abilities[a].score.value}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{signed(sheet.abilities[a].mod)}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {stat(S.hp, sheet.hp.max.value, 'preview-hp')}
          {stat(S.ac, sheet.ac.value, 'preview-ac')}
          {stat(S.initiative, signed(sheet.initiative.value), 'preview-init')}
          {stat(S.speed, sheet.speed.walk?.value ?? 0)}
          {stat(S.pb, signed(sheet.pb.value))}
          {stat(S.passives.perception, sheet.passives.perception.value, 'preview-perception')}
        </div>
        {sheet.spellcasting.classes.map((c) => (
          <p key={c.classKey} className="text-xs text-muted-foreground">
            {c.nameRu}: {S.spellDc} {c.dc.value}, {S.spellAttack.toLowerCase()} {signed(c.attack.value)}
          </p>
        ))}
      </CardContent>
    </Card>
  );
}
