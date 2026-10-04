'use client';
import { MinusIcon, PlusIcon } from 'lucide-react';
import { ru } from '@/i18n/ru';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/** Кружки ячеек/ресурсов: закрашенный — доступен. Больше 10 — счётчик. */
export function Pips({
  max,
  used,
  onUse,
  onRestore,
  label,
  disabled,
  size = 'md',
}: {
  max: number;
  used: number;
  onUse: () => void;
  onRestore: () => void;
  label: string;
  disabled?: boolean;
  size?: 'md' | 'lg';
}) {
  const left = Math.max(0, max - used);
  if (max > 10) {
    return (
      <div className="flex items-center gap-1" aria-label={label}>
        <Button size="icon-sm" variant="outline" aria-label={`${label}: −1`} disabled={disabled || left <= 0} onClick={onUse}>
          <MinusIcon />
        </Button>
        <span className="min-w-12 text-center tabular-nums">
          {left}/{max}
        </span>
        <Button size="icon-sm" variant="outline" aria-label={`${label}: +1`} disabled={disabled || used <= 0} onClick={onRestore}>
          <PlusIcon />
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={`${label}: ${left}/${max}`}>
      {Array.from({ length: max }, (_, i) => {
        const available = i < left;
        return (
          <button
            key={i}
            type="button"
            disabled={disabled}
            aria-label={`${label}: ${available ? ru.sheet.pipUse : ru.sheet.pipRestore}`}
            onClick={available ? onUse : onRestore}
            className={cn(
              'rounded-full border-2 border-primary transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none disabled:opacity-50',
              size === 'lg' ? 'size-9' : 'size-5 pointer-coarse:size-8',
              available ? 'bg-primary' : 'bg-transparent',
            )}
          />
        );
      })}
    </div>
  );
}

export function StatBox({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('grid min-w-16 justify-items-center rounded-lg border px-2 py-1.5 text-center', className)}>
      <span className="text-[11px] leading-tight text-muted-foreground">{label}</span>
      <div className="text-lg">{children}</div>
    </div>
  );
}

export function Section({
  title,
  actions,
  children,
  className,
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {actions}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function ProfDot({ level }: { level: 'none' | 'half' | 'proficient' | 'expertise' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-2.5 shrink-0 rounded-full border border-primary',
        level === 'proficient' && 'bg-primary',
        level === 'expertise' && 'bg-primary ring-2 ring-primary/40',
        level === 'half' && 'bg-gradient-to-r from-primary to-transparent',
      )}
    />
  );
}
