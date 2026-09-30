'use client';
import { ABILITIES, type Ability, type AbilityMethod } from '@ps/content-schema';
import {
  ABILITY_LABEL_RU,
  POINT_BUY_BUDGET,
  POINT_BUY_COST,
  pointBuyCost,
  rollTotal,
  STANDARD_ARRAY,
} from '@ps/rules-engine';
import { MinusIcon, PlusIcon } from 'lucide-react';
import { ru } from '@/i18n/ru';
import { cn, signed } from '@/lib/utils';
import { secureRandom } from '@/lib/random';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { StepProps } from './types';

const A = ru.builder.abilities;

const byOrder = (values: readonly number[]) =>
  Object.fromEntries(ABILITIES.map((a, i) => [a, values[i] ?? 10])) as Record<Ability, number>;

/** Значение назначается характеристике; прежний владелец значения получает её старое значение (обмен). */
function swapAssign(base: Record<Ability, number>, ability: Ability, value: number): Record<Ability, number> {
  const next = { ...base };
  const holder = ABILITIES.find((a) => a !== ability && next[a] === value);
  if (holder) next[holder] = next[ability];
  next[ability] = value;
  return next;
}

export function AbilitiesStep({ build, update, rules, sheet }: StepProps) {
  const method = build.abilities.method;
  const base = build.abilities.base;
  const setMethod = (m: AbilityMethod) =>
    update((b) => {
      const next = { ...b, abilities: { method: m, base: { ...b.abilities.base } } as typeof b.abilities };
      if (m === 'standard_array') next.abilities.base = byOrder(STANDARD_ARRAY);
      if (m === 'point_buy') next.abilities.base = byOrder([8, 8, 8, 8, 8, 8]);
      if (m === 'roll') next.abilities.base = byOrder([10, 10, 10, 10, 10, 10]);
      return next;
    });
  const setBase = (nb: Record<Ability, number>) => update((b) => ({ ...b, abilities: { ...b.abilities, base: nb } }));
  const rolls = build.abilities.rolls;
  const rolledTotals = rolls?.map(rollTotal) ?? [];
  const cost = method === 'point_buy' ? pointBuyCost(base) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{ru.builder.steps.abilities}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={A.method}>
          {rules.abilityMethods.map((m) => (
            <Button key={m} size="sm" variant={m === method ? 'default' : 'outline'} aria-pressed={m === method} onClick={() => setMethod(m)}>
              {A.methods[m]}
            </Button>
          ))}
        </div>
        {!rules.abilityMethods.includes(method) && <p className="text-sm text-destructive">{A.notAllowed}</p>}

        {method === 'point_buy' && cost !== null && (
          <p className={cn('text-sm', cost > POINT_BUY_BUDGET ? 'text-destructive' : 'text-muted-foreground')} data-testid="points-left">
            {cost > POINT_BUY_BUDGET ? A.pointsOver(cost - POINT_BUY_BUDGET) : A.pointsLeft(POINT_BUY_BUDGET - cost)}
          </p>
        )}
        {method === 'roll' && (
          <div className="grid gap-2">
            {!rolls?.length ? (
              <Button
                className="w-fit"
                onClick={() => {
                  const r = Array.from({ length: 6 }, () => Array.from({ length: 4 }, () => 1 + Math.floor(secureRandom() * 6)));
                  const totals = r.map(rollTotal);
                  update((b) => ({ ...b, abilities: { method: 'roll', base: byOrder(totals), rolls: r } }));
                }}
              >
                {A.roll}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                {A.rolled}:{' '}
                {rolls.map((r, i) => (
                  <span key={i} className="mr-2 whitespace-nowrap">
                    <strong>{rollTotal(r)}</strong> ({r.join(', ')})
                  </span>
                ))}
              </p>
            )}
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead />
              <TableHead>{A.base}</TableHead>
              <TableHead>{A.bonus}</TableHead>
              <TableHead>{A.total}</TableHead>
              <TableHead>{A.mod}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ABILITIES.map((a) => {
              const total = sheet.abilities[a].score.value;
              const pool = method === 'standard_array' ? [...STANDARD_ARRAY] : method === 'roll' ? rolledTotals : [];
              return (
                <TableRow key={a}>
                  <TableCell className="font-medium">{ABILITY_LABEL_RU[a]}</TableCell>
                  <TableCell>
                    {(method === 'standard_array' || (method === 'roll' && pool.length > 0)) && (
                      <Select value={String(base[a])} onValueChange={(v) => setBase(swapAssign(base, a, Number(v)))}>
                        <SelectTrigger className="w-20" aria-label={ABILITY_LABEL_RU[a]}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[...new Set(pool)].sort((x, y) => y - x).map((v) => (
                            <SelectItem key={v} value={String(v)}>
                              {v}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {method === 'point_buy' && (
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`− ${ABILITY_LABEL_RU[a]}`}
                          disabled={base[a] <= 8}
                          onClick={() => setBase({ ...base, [a]: base[a] - 1 })}
                        >
                          <MinusIcon />
                        </Button>
                        <span className="w-6 text-center tabular-nums">{base[a]}</span>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`+ ${ABILITY_LABEL_RU[a]}`}
                          disabled={base[a] >= 15 || (cost ?? 0) + (POINT_BUY_COST[base[a] + 1]! - POINT_BUY_COST[base[a]]!) > POINT_BUY_BUDGET}
                          onClick={() => setBase({ ...base, [a]: base[a] + 1 })}
                        >
                          <PlusIcon />
                        </Button>
                      </div>
                    )}
                    {method === 'manual' && (
                      <Input
                        type="number"
                        min={1}
                        max={30}
                        className="w-20"
                        aria-label={ABILITY_LABEL_RU[a]}
                        value={base[a]}
                        onChange={(e) => {
                          const v = Math.max(1, Math.min(30, Number(e.target.value) || 1));
                          setBase({ ...base, [a]: v });
                        }}
                      />
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{total - base[a] ? signed(total - base[a]) : '—'}</TableCell>
                  <TableCell className="font-semibold tabular-nums" data-testid={`ability-total-${a}`}>
                    {total}
                  </TableCell>
                  <TableCell className="tabular-nums">{signed(sheet.abilities[a].mod)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
