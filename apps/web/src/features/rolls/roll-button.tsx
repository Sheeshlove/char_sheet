'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RollMode, RollResult } from '@ps/rules-engine';
import { DicesIcon } from 'lucide-react';
import { useTRPC } from '@/lib/trpc/client';
import { ru } from '@/i18n/ru';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RollResultView } from './roll-result';

const R = ru.rolls;
export type RollVisibility = 'private' | 'gm' | 'party';

export function useRoll() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  return useMutation(
    trpc.rolls.roll.mutationOptions({
      onSuccess: () => void qc.invalidateQueries({ queryKey: trpc.rolls.list.pathKey() }),
    }),
  );
}

/** Модификатор → формула к20: `1d20+5`, `1d20-1`. */
export function d20(mod: number): string {
  return mod === 0 ? '1d20' : `1d20${mod > 0 ? '+' : '-'}${Math.abs(mod)}`;
}

/**
 * Кнопка броска в листе: всплывающее окно с выбором режима (обычный / преимущество / помеха)
 * и результатом. Бросок идёт на сервер и попадает в журнал кампании.
 */
export function RollButton({
  expression,
  label,
  characterId,
  campaignId,
  className,
  size = 'icon-sm',
  children,
}: {
  expression: string;
  label: string;
  characterId: string;
  campaignId: string | null;
  className?: string;
  size?: 'icon-sm' | 'icon';
  /** Своё содержимое кнопки (игровой режим: название и модификатор). */
  children?: React.ReactNode;
}) {
  const roll = useRoll();
  const [result, setResult] = useState<RollResult | null>(null);
  const isD20 = /^1d20([+-]\d+)?$/.test(expression);
  const go = (mode: RollMode) =>
    roll.mutate(
      { campaignId, characterId, expression, mode, label, visibility: campaignId ? 'party' : 'private' },
      { onSuccess: (r) => setResult(r.result) },
    );
  return (
    <Popover onOpenChange={(o) => !o && setResult(null)}>
      <PopoverTrigger asChild>
        {children ? (
          <Button type="button" variant="outline" className={className} title={`${R.rollFor(label)} (${expression})`}>
            {children}
          </Button>
        ) : (
          <Button type="button" size={size} variant="ghost" className={cn('text-muted-foreground', className)} aria-label={R.rollFor(label)} title={`${R.rollFor(label)} (${expression})`}>
            <DicesIcon />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-64 gap-2">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{expression.replace(/d/g, 'к')}</div>
        <div className="flex flex-wrap gap-1">
          {(isD20 ? (['normal', 'advantage', 'disadvantage'] as const) : (['normal'] as const)).map((m) => (
            <Button key={m} size="sm" variant={m === 'normal' ? 'default' : 'outline'} disabled={roll.isPending} onClick={() => go(m)}>
              {m === 'normal' ? R.roll : R.modes[m]}
            </Button>
          ))}
        </div>
        {result && <RollResultView result={result} />}
      </PopoverContent>
    </Popover>
  );
}
