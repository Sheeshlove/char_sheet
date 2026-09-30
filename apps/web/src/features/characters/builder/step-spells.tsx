'use client';
import { ru } from '@/i18n/ru';
import { Card, CardContent } from '@/components/ui/card';
import { ChoiceEditor } from '../choice-editor';
import type { StepProps } from './types';

const S = ru.builder.spells;

export function SpellsStep({ onChoice, sheet }: StepProps) {
  const choices = sheet.choices.filter((c) => c.kind === 'spells' || c.kind === 'spellbook');
  const grantChoices = sheet.choices.filter((c) => c.kind === 'choice' && c.source?.kind === 'spells');
  if (!choices.length && !grantChoices.length) {
    return (
      <Card>
        <CardContent className="text-muted-foreground">{S.none}</CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="grid gap-3">
        {[...choices, ...grantChoices].map((c) => (
          <ChoiceEditor key={c.key} choice={c} onChange={(v) => onChoice(c.key, v)} />
        ))}
        {sheet.spellcasting.classes.some((c) => c.preparation !== 'known') && (
          <p className="text-xs text-muted-foreground">{S.preparedNote}</p>
        )}
      </CardContent>
    </Card>
  );
}
