'use client';
import { RollButton } from '@/features/rolls/roll-button';
import { useSheet } from './context';

export { d20 } from '@/features/rolls/roll-button';

/** Кнопка броска в листе: только для тех, кто может менять состояние персонажа. */
export function SheetRoll({
  expression,
  label,
  className,
  children,
}: {
  expression: string;
  label: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const { characterId, character, canEditState } = useSheet();
  if (!canEditState) return null;
  return (
    <RollButton expression={expression} label={label} characterId={characterId} campaignId={character.campaign?.id ?? null} className={className}>
      {children}
    </RollButton>
  );
}

/** Формула урона строки атаки: `1d8+3`; без костей (безоружный удар) броска нет. */
export function damageExpr(d: { dice: string; bonus: number }): string | null {
  if (!d.dice) return null;
  return `${d.dice}${d.bonus ? `${d.bonus > 0 ? '+' : '-'}${Math.abs(d.bonus)}` : ''}`;
}
