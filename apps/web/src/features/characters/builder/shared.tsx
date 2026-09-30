'use client';
import type { Feature } from '@ps/content-schema';
import type { ChoiceInfo } from '@ps/rules-engine';
import { cn } from '@/lib/utils';
import { Markdown } from '@/components/markdown';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChoiceEditor } from '../choice-editor';

/** Сетка карточек выбора сущности (раса, класс, предыстория). */
export function EntityPicker<T extends { key: string; nameRu: string; sourceBook?: string }>({
  items,
  selected,
  onSelect,
  label,
  describe,
}: {
  items: T[];
  selected: string | undefined;
  onSelect: (key: string) => void;
  label: string;
  describe?: (item: T) => React.ReactNode;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((it) => {
        const active = it.key === selected;
        return (
          <button
            key={it.key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onSelect(it.key)}
            className={cn(
              'grid gap-1 rounded-lg border p-3 text-left transition-colors hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none',
              active && 'border-primary bg-primary/10',
            )}
          >
            <span className="font-medium">{it.nameRu}</span>
            {describe && <span className="text-xs text-muted-foreground">{describe(it)}</span>}
            {it.sourceBook && <span className="text-[11px] text-muted-foreground/80">{it.sourceBook}</span>}
          </button>
        );
      })}
    </div>
  );
}

const STATUS_VARIANT = { complete: 'success', partial: 'warning', text_only: 'outline' } as const;

/** Список особенностей с текстом по раскрытию. */
export function FeatureList({ features, statusLabels }: { features: Feature[]; statusLabels: Record<Feature['effectsStatus'], string> }) {
  const visible = features.filter((f) => !f.hidden);
  if (!visible.length) return null;
  return (
    <ul className="grid gap-1">
      {visible.map((f, i) => (
        <li key={`${i}:${f.key}`}>
          <details className="group rounded-md border px-3 py-2">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium">
              <span>
                {f.nameRu}
                {f.level ? <span className="ml-1 text-xs text-muted-foreground">({f.level})</span> : null}
              </span>
              <Badge variant={STATUS_VARIANT[f.effectsStatus]}>{statusLabels[f.effectsStatus]}</Badge>
            </summary>
            {f.textMd && <Markdown className="mt-2 text-sm">{f.textMd}</Markdown>}
          </details>
        </li>
      ))}
    </ul>
  );
}

/** Блок выборов, относящихся к шагу. */
export function ChoicesBlock({
  title,
  choices,
  onChoice,
}: {
  title: string;
  choices: ChoiceInfo[];
  onChoice: (key: string, selected: string[]) => void;
}) {
  if (!choices.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {choices.map((c) => (
          <ChoiceEditor key={c.key} choice={c} onChange={(v) => onChoice(c.key, v)} />
        ))}
      </CardContent>
    </Card>
  );
}
