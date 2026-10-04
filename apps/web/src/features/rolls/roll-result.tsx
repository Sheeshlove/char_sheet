'use client';
import type { RollResult } from '@ps/rules-engine';
import { ru } from '@/i18n/ru';
import { cn } from '@/lib/utils';

const R = ru.rolls;

/** Результат броска: итог крупно, кости (отброшенные зачёркнуты), отметка натуральных 20/1. */
export function RollResultView({ result, compact = false }: { result: RollResult; compact?: boolean }) {
  const nat = result.natural;
  return (
    <div className={cn('flex flex-wrap items-baseline gap-x-2 gap-y-1', compact ? 'text-sm' : '')} data-testid="roll-result">
      <span
        className={cn(
          'font-semibold tabular-nums',
          compact ? 'text-base' : 'text-2xl',
          nat === 20 && 'text-green-600 dark:text-green-400',
          nat === 1 && 'text-destructive',
        )}
        data-testid="roll-total"
      >
        {result.total}
      </span>
      <span className="text-xs text-muted-foreground tabular-nums">
        {result.terms.map((t, i) => (
          <span key={i}>
            {i > 0 || t.sign < 0 ? (t.sign < 0 ? ' − ' : ' + ') : ''}
            {t.kind === 'mod' ? (
              t.value
            ) : (
              <>
                [
                {t.rolls.map((v, j) => (
                  <span key={j} className={cn(!t.kept[j] && 'line-through opacity-60')}>
                    {j > 0 ? ', ' : ''}
                    {v}
                  </span>
                ))}
                ]
              </>
            )}
          </span>
        ))}
        {result.mode !== 'normal' && ` · ${R.modeShort[result.mode]}`}
      </span>
      {nat === 20 && <span className="text-xs font-medium text-green-600 dark:text-green-400">{R.nat20}</span>}
      {nat === 1 && <span className="text-xs font-medium text-destructive">{R.nat1}</span>}
    </div>
  );
}
