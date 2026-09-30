'use client';
import { ru } from '@/i18n/ru';
import { Markdown } from '@/components/markdown';
import { Badge } from '@/components/ui/badge';
import { Section } from './bits';
import { useSheet } from './context';

const S = ru.sheet;
const VARIANT = { complete: 'success', partial: 'warning', text_only: 'outline' } as const;

export function TabFeatures() {
  const { sheet } = useSheet();
  if (!sheet.features.length) return <p className="text-muted-foreground">{S.noFeatures}</p>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {sheet.features.map((src) => (
        <Section key={src.sourceKey} title={src.sourceLabelRu}>
          <ul className="grid gap-1">
            {src.features.map((f) => (
              <li key={f.key}>
                <details className="rounded-md border px-3 py-2">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium">
                    <span>
                      {f.nameRu}
                      {f.level ? <span className="ml-1 text-xs text-muted-foreground">({f.level})</span> : null}
                    </span>
                    <Badge variant={VARIANT[f.automated]}>{S.automated[f.automated]}</Badge>
                  </summary>
                  {f.notes.length > 0 && (
                    <ul className="mt-2 grid gap-0.5 text-sm">
                      {f.notes.map((n, i) => (
                        <li key={i}>• {n}</li>
                      ))}
                    </ul>
                  )}
                  {f.textMd && <Markdown className="mt-2 text-sm text-muted-foreground">{f.textMd}</Markdown>}
                </details>
              </li>
            ))}
          </ul>
        </Section>
      ))}
    </div>
  );
}
