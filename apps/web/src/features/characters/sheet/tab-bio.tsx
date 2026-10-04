'use client';
import { ru } from '@/i18n/ru';
import { Markdown } from '@/components/markdown';
import { Section } from './bits';
import { useSheet } from './context';

const S = ru.sheet;
const D = ru.builder.description;
const P = ru.builder.background;

export function TabBio() {
  const { character } = useSheet();
  const id = character.build.identity;
  const short = (['alignment', 'age', 'height', 'weight', 'eyes', 'skin', 'hair'] as const).filter((k) => id[k]);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title={S.identity}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {short.map((k) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{D[k]}</dt>
              <dd>{id[k]}</dd>
            </div>
          ))}
        </dl>
        {id.appearanceMd && (
          <>
            <p className="mt-3 text-sm font-medium">{S.appearance}</p>
            <Markdown className="text-sm">{id.appearanceMd}</Markdown>
          </>
        )}
      </Section>
      <Section title={S.personality}>
        <dl className="grid gap-2 text-sm">
          {(['traits', 'ideals', 'bonds', 'flaws'] as const).map((k) =>
            id.personality[k] ? (
              <div key={k}>
                <dt className="text-muted-foreground">{P[k]}</dt>
                <dd>{id.personality[k]}</dd>
              </div>
            ) : null,
          )}
        </dl>
      </Section>
      {id.backstoryMd && (
        <Section title={S.backstory} className="lg:col-span-2">
          <Markdown className="text-sm">{id.backstoryMd}</Markdown>
        </Section>
      )}
      {id.alliesMd && (
        <Section title={D.allies} className="lg:col-span-2">
          <Markdown className="text-sm">{id.alliesMd}</Markdown>
        </Section>
      )}
    </div>
  );
}
