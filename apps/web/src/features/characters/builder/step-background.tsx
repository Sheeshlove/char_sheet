'use client';
import { SKILL_LABEL_RU } from '@ps/rules-engine';
import { ru } from '@/i18n/ru';
import { selectable } from '@/lib/content/use-content';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ChoicesBlock, EntityPicker, FeatureList } from './shared';
import type { StepProps } from './types';

const B = ru.builder;
const P = ru.builder.background;
const FIELDS = ['traits', 'ideals', 'bonds', 'flaws'] as const;

export function BackgroundStep({ build, update, onChoice, content, sheet }: StepProps) {
  const backgrounds = selectable(content, 'background');
  const bg = build.background ? content.index.getOf(build.background, 'background') : undefined;
  const choices = sheet.choices.filter((c) => c.kind === 'choice' && c.sourceKey === build.background);
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{B.chooseBackground}</CardTitle>
        </CardHeader>
        <CardContent>
          <EntityPicker
            label={B.chooseBackground}
            items={backgrounds}
            selected={build.background}
            onSelect={(key) => update((b) => ({ ...b, background: key }))}
            describe={(b) => (Array.isArray(b.data.skills) ? b.data.skills.map((s) => SKILL_LABEL_RU[s]).join(', ') : '')}
          />
        </CardContent>
      </Card>
      {bg && (
        <Card>
          <CardHeader>
            <CardTitle>
              {bg.nameRu}: {B.features.toLowerCase()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FeatureList features={[bg.data.feature]} statusLabels={ru.sheet.automated} />
          </CardContent>
        </Card>
      )}
      <ChoicesBlock title={B.choicesFor(bg?.nameRu ?? '')} choices={choices} onChoice={onChoice} />
      <Card>
        <CardHeader>
          <CardTitle>{P.personality}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {FIELDS.map((f) => {
            const table = bg?.data.characteristics[f] ?? [];
            const value = build.identity.personality[f];
            const set = (v: string) =>
              update((b) => ({ ...b, identity: { ...b.identity, personality: { ...b.identity.personality, [f]: v } } }));
            return (
              <Field key={f} label={P[f]} htmlFor={`pers-${f}`}>
                {table.length > 0 && (
                  <Select value={table.includes(value) ? value : ''} onValueChange={set}>
                    <SelectTrigger aria-label={`${P[f]}: ${P.pickFromTable}`}>
                      <SelectValue placeholder={P.pickFromTable} />
                    </SelectTrigger>
                    <SelectContent>
                      {table.map((t, i) => (
                        <SelectItem key={i} value={t}>
                          <span className="line-clamp-2 whitespace-normal">{t}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Textarea id={`pers-${f}`} rows={3} value={value} maxLength={4000} onChange={(e) => set(e.target.value)} placeholder={P.custom} />
              </Field>
            );
          })}
        </CardContent>
      </Card>
    </>
  );
}
