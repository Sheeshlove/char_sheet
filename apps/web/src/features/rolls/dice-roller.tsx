'use client';
import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { RollMode } from '@ps/rules-engine';
import { DicesIcon, EyeIcon, LockIcon, UsersIcon } from 'lucide-react';
import { useTRPC } from '@/lib/trpc/client';
import { ru } from '@/i18n/ru';
import { formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RollResultView } from './roll-result';
import { useRoll, type RollVisibility } from './roll-button';

const R = ru.rolls;
const VIS_ICON = { private: LockIcon, gm: EyeIcon, party: UsersIcon } as const;

/** Произвольный бросок и журнал бросков кампании (SPEC §4.7): опрос раз в 5 с. */
export function DiceRoller({ campaignId }: { campaignId: string | null }) {
  const trpc = useTRPC();
  const roll = useRoll();
  const [expression, setExpression] = useState('1d20');
  const [label, setLabel] = useState('');
  const [mode, setMode] = useState<RollMode>('normal');
  const [visibility, setVisibility] = useState<RollVisibility>(campaignId ? 'party' : 'private');
  const log = useInfiniteQuery({
    ...trpc.rolls.list.infiniteQueryOptions({ campaignId, limit: 20 }, { getNextPageParam: (last) => last.nextCursor }),
    refetchInterval: 5000,
  });
  const items = log.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DicesIcon className="size-5" />
          {R.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            roll.mutate({ campaignId, expression, mode, label: label.trim(), visibility });
          }}
        >
          <div className="flex flex-wrap gap-2">
            <Input
              value={expression}
              onChange={(e) => setExpression(e.target.value)}
              aria-label={R.expression}
              placeholder={R.expressionHint}
              className="w-40 font-mono"
              maxLength={100}
              data-testid="roll-expression"
            />
            <Input value={label} onChange={(e) => setLabel(e.target.value)} aria-label={R.label} placeholder={R.label} className="min-w-32 flex-1" maxLength={120} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border p-0.5" role="radiogroup" aria-label={R.modes.normal}>
              {(['normal', 'advantage', 'disadvantage'] as const).map((m) => (
                <Button
                  key={m}
                  type="button"
                  size="sm"
                  variant={mode === m ? 'secondary' : 'ghost'}
                  role="radio"
                  aria-checked={mode === m}
                  className="h-7"
                  onClick={() => setMode(m)}
                >
                  {R.modes[m]}
                </Button>
              ))}
            </div>
            {campaignId && (
              <Select value={visibility} onValueChange={(v) => setVisibility(v as RollVisibility)}>
                <SelectTrigger size="sm" className="w-36" aria-label={R.visibility}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['party', 'gm', 'private'] as const).map((v) => (
                    <SelectItem key={v} value={v}>
                      {R.visibilities[v]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button type="submit" size="sm" disabled={roll.isPending || !expression.trim()} data-testid="roll-submit">
              <DicesIcon />
              {R.roll}
            </Button>
          </div>
        </form>
        {roll.data && <RollResultView result={roll.data.result} />}
        <ul className="grid gap-1.5 border-t pt-2" data-testid="roll-log">
          {items.length === 0 && <li className="text-sm text-muted-foreground">{R.empty}</li>}
          {items.map((r) => {
            const Vis = VIS_ICON[r.visibility];
            return (
              <li key={r.id} className="grid gap-0.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Vis className="size-3" aria-label={R.visibilities[r.visibility]} />
                    <span className="font-medium text-foreground">{r.characterName ?? r.userName}</span>
                    {r.label && <span>· {r.label}</span>}
                    <span className="font-mono">· {r.expression.replace(/d/g, 'к')}</span>
                  </span>
                  <span>{formatDateTime(r.createdAt)}</span>
                </div>
                <RollResultView result={r.result} compact />
              </li>
            );
          })}
        </ul>
        {log.hasNextPage && (
          <Button size="sm" variant="ghost" onClick={() => void log.fetchNextPage()}>
            {ru.common.more}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
