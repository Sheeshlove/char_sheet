'use client';
import { useState } from 'react';
import { PlusIcon, XIcon } from 'lucide-react';
import { CONDITIONS, type ConditionId } from '@ps/content-schema';
import { CONDITION_LABEL_RU, DAMAGE_TYPE_LABEL_RU, diceRu } from '@ps/rules-engine';
import { ru } from '@/i18n/ru';
import { formatDamage, formatFeet } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { HpBar } from '../character-card';
import { Pips, Section, StatBox } from './bits';
import { useSheet } from './context';
import { HpDialog, type HpAction } from './hp-dialog';
import { LongRestDialog, ShortRestDialog } from './rest-dialogs';
import { ValButton } from './val';

const S = ru.sheet;

export function CoreStats() {
  const { sheet } = useSheet();
  return (
    <div className="flex flex-wrap gap-2">
      <StatBox label={S.ac}>
        <ValButton val={sheet.ac} path="ac" label={S.ac} testId="stat-ac" />
      </StatBox>
      <StatBox label={S.initiative}>
        <ValButton val={sheet.initiative} path="initiative" label={S.initiative} sign testId="stat-init" />
      </StatBox>
      <StatBox label={S.speed}>
        {sheet.speed.walk ? <ValButton val={sheet.speed.walk} path="speed.walk" label={S.speed} testId="stat-speed" /> : '0'}
      </StatBox>
      <StatBox label={S.pb}>
        <ValButton val={sheet.pb} path="pb" label={S.pb} sign />
      </StatBox>
    </div>
  );
}

export function HpBlock({ big = false }: { big?: boolean }) {
  const { sheet, canEditState } = useSheet();
  const [action, setAction] = useState<HpAction | null>(null);
  const hp = sheet.hp;
  return (
    <div className="grid gap-3">
      <div className="flex items-end justify-between gap-2">
        <div>
          <span className="text-xs text-muted-foreground">{S.hp}</span>
          <div className={cn('font-semibold tabular-nums', big ? 'text-4xl' : 'text-2xl')} data-testid="hp-current">
            {hp.current}
            <span className="text-base text-muted-foreground">
              {' / '}
              <ValButton val={hp.max} path="hp.max" label={S.hp} testId="hp-max" />
            </span>
          </div>
        </div>
        {hp.temp > 0 && (
          <Badge variant="secondary" data-testid="hp-temp">
            {S.tempHp}: {hp.temp}
          </Badge>
        )}
      </div>
      <HpBar current={hp.current} max={hp.max.value} temp={hp.temp} className={big ? 'h-3' : undefined} />
      {canEditState && (
        <div className="grid grid-cols-3 gap-2">
          <Button variant="destructive" size={big ? 'lg' : 'default'} onClick={() => setAction('damage')} data-testid="btn-damage">
            {S.damageBtn}
          </Button>
          <Button size={big ? 'lg' : 'default'} className="bg-success text-white hover:bg-success/90" onClick={() => setAction('heal')} data-testid="btn-heal">
            {S.healBtn}
          </Button>
          <Button variant="secondary" size={big ? 'lg' : 'default'} onClick={() => setAction('temp')}>
            {S.tempBtn}
          </Button>
        </div>
      )}
      <HpDialog action={action} onClose={() => setAction(null)} />
    </div>
  );
}

export function DeathSaves() {
  const { sheet, run, canEditState } = useSheet();
  const ds = sheet.status.deathSaves;
  if (sheet.hp.current > 0 && !ds.successes && !ds.failures && !ds.dead) return null;
  return (
    <Section title={S.deathSaves}>
      <div className="grid gap-2 text-sm" data-testid="death-saves">
        {ds.dead ? (
          <Badge variant="destructive">{S.dead}</Badge>
        ) : ds.stable ? (
          <Badge variant="success">{S.stable}</Badge>
        ) : null}
        <p>
          {S.successes}: {'●'.repeat(ds.successes)}
          {'○'.repeat(3 - ds.successes)} · {S.failures}: {'●'.repeat(ds.failures)}
          {'○'.repeat(3 - ds.failures)}
        </p>
        {canEditState && !ds.dead && !ds.stable && (
          <div className="grid grid-cols-4 gap-2">
            {(['success', 'failure', 'nat20', 'nat1'] as const).map((r) => (
              <Button key={r} size="sm" variant={r === 'success' || r === 'nat20' ? 'outline' : 'secondary'} onClick={() => run({ type: 'death_save', result: r })}>
                {S.deathSave[r]}
              </Button>
            ))}
          </div>
        )}
      </div>
    </Section>
  );
}

export function ConditionsBlock() {
  const { sheet, run, canEditState } = useSheet();
  const st = sheet.status;
  const available = CONDITIONS.filter((c) => c !== 'exhaustion' && !st.conditions.includes(c));
  return (
    <Section
      title={S.conditions}
      actions={
        canEditState && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" aria-label={S.addCondition}>
                <PlusIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="max-h-72 overflow-y-auto">
              {available.map((c) => (
                <DropdownMenuItem key={c} onSelect={() => run({ type: 'add_condition', condition: c as ConditionId })}>
                  {CONDITION_LABEL_RU[c as ConditionId]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      }
    >
      <div className="grid gap-3">
        <div className="flex flex-wrap gap-1.5" data-testid="conditions">
          {st.conditions.length === 0 && <span className="text-sm text-muted-foreground">{ru.common.none}</span>}
          {st.conditions.map((c) => (
            <Badge key={c} variant="warning" className="gap-1 pr-1">
              {CONDITION_LABEL_RU[c]}
              {canEditState && (
                <button type="button" aria-label={`${ru.common.remove}: ${CONDITION_LABEL_RU[c]}`} onClick={() => run({ type: 'remove_condition', condition: c })}>
                  <XIcon className="size-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
        <div className="grid gap-1 text-sm">
          <span id="exhaustion-label">{S.exhaustion}</span>
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-labelledby="exhaustion-label" data-testid="exhaustion">
            {[0, 1, 2, 3, 4, 5, 6].map((n) => (
              <Button
                key={n}
                size="icon-sm"
                role="radio"
                aria-checked={st.exhaustion === n}
                variant={st.exhaustion === n ? (n ? 'destructive' : 'default') : 'outline'}
                disabled={!canEditState}
                onClick={() => st.exhaustion !== n && run({ type: 'set_exhaustion', level: n })}
              >
                {n}
              </Button>
            ))}
          </div>
        </div>
        {st.concentration && (
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="secondary">
              {S.concentration}: {st.concentration.nameRu}
            </Badge>
            {canEditState && (
              <Button size="sm" variant="ghost" onClick={() => run({ type: 'drop_concentration' })}>
                {S.dropConcentration}
              </Button>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}

export function ResourcesBlock({ big = false }: { big?: boolean }) {
  const { sheet, run, canEditState } = useSheet();
  if (!sheet.resources.length && !sheet.toggles.length) return null;
  return (
    <Section title={S.resources}>
      <div className="grid gap-3">
        {sheet.resources.map((r) => (
          <div key={r.id} className="grid gap-1" data-testid={`resource-${r.id}`}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium">
                {r.nameRu}
                {r.die ? ` (${diceRu(r.die)})` : ''}
              </span>
              <span className="text-xs text-muted-foreground">{S.reset[r.reset as keyof typeof S.reset] ?? r.reset}</span>
            </div>
            <Pips
              max={r.max}
              used={r.used}
              label={r.nameRu}
              disabled={!canEditState}
              size={big ? 'lg' : 'md'}
              onUse={() => run({ type: 'use_resource', id: r.id })}
              onRestore={() => run({ type: 'restore_resource', id: r.id })}
            />
          </div>
        ))}
        {sheet.toggles.map((t) => (
          <Label key={t.id} className="justify-between font-normal" data-testid={`toggle-${t.id}`}>
            <span>
              {t.labelRu}
              {t.cost && <span className="ml-1 text-xs text-muted-foreground">(−{t.cost.amount})</span>}
            </span>
            <Switch checked={t.active} disabled={!canEditState} onCheckedChange={(on) => run({ type: 'set_toggle', id: t.id, on })} />
          </Label>
        ))}
      </div>
    </Section>
  );
}

export function AttacksTable() {
  const { sheet } = useSheet();
  return (
    <Section title={S.attacks} actions={<span className="text-xs text-muted-foreground">{S.attacksPerAction(sheet.attacksPerAction)}</span>}>
      {sheet.attacks.length === 0 ? (
        <p className="text-sm text-muted-foreground">{S.noAttacks}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{S.attackName}</TableHead>
              <TableHead>{S.toHit}</TableHead>
              <TableHead>{S.damage}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sheet.attacks.map((a) => (
              <TableRow key={a.id} data-testid="attack-row">
                <TableCell>
                  <div className="font-medium">{a.nameRu}</div>
                  <div className="text-xs text-muted-foreground">
                    {[
                      a.rangeFt ? `${formatFeet(a.rangeFt.normal)}${a.rangeFt.long !== a.rangeFt.normal ? `/${a.rangeFt.long}` : ''}` : null,
                      ...a.properties,
                      ...a.notes,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </TableCell>
                <TableCell>
                  {a.toHit && <ValButton val={a.toHit} label={`${a.nameRu}: ${S.toHit}`} sign />}
                  {a.saveDc && (
                    <span className="whitespace-nowrap text-sm">
                      {S.saveDc} <ValButton val={a.saveDc} label={`${a.nameRu}: ${S.saveDc}`} />
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  {a.damage.map((d, i) => (
                    <div key={i} className="whitespace-nowrap">
                      {formatDamage(d, DAMAGE_TYPE_LABEL_RU)}
                    </div>
                  ))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {sheet.critMin < 20 && <p className="mt-2 text-xs text-muted-foreground">{S.critRange(sheet.critMin)}</p>}
    </Section>
  );
}

export function TabCombat() {
  const { sheet } = useSheet();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="grid content-start gap-4">
        <Section title={S.hp}>
          <div className="grid gap-4">
            <CoreStats />
            <HpBlock />
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">{S.hitDice}:</span>
              {sheet.hitDice.map((h) => (
                <Badge key={h.die} variant="outline">
                  к{h.die}: {h.total - h.used}/{h.total}
                </Badge>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <ShortRestDialog />
              <LongRestDialog />
            </div>
          </div>
        </Section>
        <DeathSaves />
        <ConditionsBlock />
      </div>
      <div className="grid content-start gap-4">
        <AttacksTable />
        <ResourcesBlock />
      </div>
    </div>
  );
}
