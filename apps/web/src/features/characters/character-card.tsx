'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { SheetSummary } from '@ps/rules-engine';
import { ru } from '@/i18n/ru';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

/** Портрет или инициалы (и когда файл не загрузился: нет сети, не восстановлен из копии). */
export function Portrait({ url, name, className }: { url: string | null | undefined; name: string; className?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return url && url !== failedUrl ? (
    <img
      src={url}
      alt={ru.characters.portraitAlt(name)}
      className={cn('rounded-lg object-cover', className)}
      onError={() => setFailedUrl(url)}
    />
  ) : (
    <div
      aria-hidden
      className={cn('flex items-center justify-center rounded-lg bg-muted font-semibold text-muted-foreground', className)}
    >
      {initials || '?'}
    </div>
  );
}

/** Полоса хитов. */
export function HpBar({ current, max, temp = 0, className }: { current: number; max: number; temp?: number; className?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  const color = pct > 50 ? 'bg-success' : pct > 25 ? 'bg-warning' : 'bg-destructive';
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)} aria-hidden>
      <div className={cn('h-full transition-all', color)} style={{ width: `${pct}%` }} />
      {temp > 0 && <div className="-mt-2 h-2 bg-primary/60" style={{ width: `${Math.min(100, (temp / Math.max(1, max)) * 100)}%` }} />}
    </div>
  );
}

export type CharacterCardData = {
  id: string;
  name: string;
  portraitUrl: string | null;
  status: 'draft' | 'ready';
  summary: SheetSummary | null;
  subtitle?: string | null;
  badge?: string | null;
  archived?: boolean;
};

export function CharacterCard({ c, href }: { c: CharacterCardData; href?: string }) {
  const s = c.summary;
  const link = href ?? (c.status === 'draft' ? `/characters/${c.id}/build` : `/characters/${c.id}`);
  return (
    <Link href={link} className="group" data-testid="character-card">
      <Card className="h-full transition-colors group-hover:border-primary/60">
        <CardContent className="flex gap-3">
          <Portrait url={c.portraitUrl} name={c.name || '?'} className="size-16 shrink-0" />
          <div className="grid min-w-0 flex-1 content-start gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-semibold">{c.name || ru.characters.newTitle}</span>
              {c.status === 'draft' && <Badge variant="warning">{ru.characters.draft}</Badge>}
              {c.archived && <Badge variant="outline">{ru.characters.archived}</Badge>}
            </div>
            {s && (s.raceLabelRu || s.classLabelRu) && (
              <span className="truncate text-sm text-muted-foreground">
                {[s.raceLabelRu, s.classLabelRu].filter(Boolean).join(' · ')}
              </span>
            )}
            {c.subtitle && <span className="truncate text-xs text-muted-foreground">{c.subtitle}</span>}
            {s && c.status === 'ready' && (
              <div className="mt-1 grid gap-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {ru.sheet.hp}: {s.hp.current}/{s.hp.max}
                    {s.hp.temp ? ` (+${s.hp.temp})` : ''}
                  </span>
                  <span>
                    {ru.sheet.ac} {s.ac}
                  </span>
                </div>
                <HpBar current={s.hp.current} max={s.hp.max} />
              </div>
            )}
            {c.badge && (
              <Badge variant="secondary" className="w-fit">
                {c.badge}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
