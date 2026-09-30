'use client';
import { DAMAGE_TYPE_LABEL_RU } from '@ps/rules-engine';
import { formatDamage } from '@/lib/format';
import { ru } from '@/i18n/ru';
import { signed } from '@/lib/utils';
import { HpBar } from '../character-card';
import { Section } from './bits';
import { useSheet } from './context';
import { ConditionsBlock, DeathSaves, HpBlock, ResourcesBlock } from './tab-combat';
import { GrantsBlock, SlotsBlock } from './tab-spells';
import { LongRestDialog, ShortRestDialog } from './rest-dialogs';

const S = ru.sheet;

/** Липкая шапка телефона: имя, полоса хитов, КД, инициатива, скорость, БМ (SPEC §12.1). */
export function StickyStats() {
  const { sheet } = useSheet();
  const cell = (label: string, value: string, testId?: string) => (
    <div className="grid text-center">
      <span className="text-[10px] leading-tight text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums" data-testid={testId}>
        {value}
      </span>
    </div>
  );
  return (
    <div className="sticky top-14 z-20 -mx-3 mb-3 grid gap-1 border-b bg-background/95 px-3 py-2 backdrop-blur sm:-mx-4 sm:px-4 md:hidden" data-testid="sticky-stats">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="truncate font-semibold">{sheet.identity.name}</span>
        <span className="tabular-nums">
          {sheet.hp.current}/{sheet.hp.max.value}
          {sheet.hp.temp ? ` +${sheet.hp.temp}` : ''}
        </span>
      </div>
      <HpBar current={sheet.hp.current} max={sheet.hp.max.value} temp={sheet.hp.temp} />
      <div className="grid grid-cols-4 gap-1">
        {cell(S.ac, String(sheet.ac.value), 'sticky-ac')}
        {cell(S.initiative, signed(sheet.initiative.value))}
        {cell(S.speed, String(sheet.speed.walk?.value ?? 0))}
        {cell(S.pb, signed(sheet.pb.value))}
      </div>
    </div>
  );
}

/** Игровой режим: крупные элементы для телефона (SPEC §12.2). */
export function PlayMode() {
  const { sheet } = useSheet();
  return (
    <div className="grid gap-4 md:grid-cols-2" data-testid="play-mode">
      <div className="grid content-start gap-4">
        <Section title={S.hp}>
          <HpBlock big />
        </Section>
        <DeathSaves />
        <div className="grid grid-cols-2 gap-2">
          <ShortRestDialog size="lg" />
          <LongRestDialog size="lg" />
        </div>
        <ConditionsBlock />
      </div>
      <div className="grid content-start gap-4">
        <SlotsBlock big />
        <ResourcesBlock big />
        <GrantsBlock />
        {sheet.attacks.length > 0 && (
          <Section title={S.attacks}>
            <ul className="grid gap-2 text-sm">
              {sheet.attacks.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2">
                  <span className="font-medium">{a.nameRu}</span>
                  <span className="text-right tabular-nums">
                    {a.toHit ? signed(a.toHit.value) : a.saveDc ? `${S.saveDc} ${a.saveDc.value}` : ''}{' '}
                    <span className="text-muted-foreground">
                      {a.damage.map((d) => formatDamage(d, DAMAGE_TYPE_LABEL_RU)).join(', ')}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}
