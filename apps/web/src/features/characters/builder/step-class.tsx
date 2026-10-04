'use client';
import { ABILITY_LABEL_RU } from '@ps/rules-engine';
import { ru } from '@/i18n/ru';
import { selectable } from '@/lib/content/use-content';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChoicesBlock, EntityPicker, FeatureList } from './shared';
import { stepOfChoice, type StepProps } from './types';

const B = ru.builder;

export function ClassStep({ build, update, onChoice, content, sheet, rules }: StepProps) {
  const classes = selectable(content, 'class');
  const first = build.classes[0];
  const cls = first ? content.index.getOf(first.classKey, 'class') : undefined;
  const sub = first?.subclassKey ? content.index.getOf(first.subclassKey, 'subclass') : undefined;
  const level = build.levels.length;
  const choices = sheet.choices.filter((c) => (c.kind === 'choice' || c.kind === 'subclass') && stepOfChoice(c, build) === 'class');
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{B.chooseClass}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          <EntityPicker
            label={B.chooseClass}
            items={classes}
            selected={first?.classKey}
            onSelect={(classKey) =>
              update((b) =>
                b.classes[0]?.classKey === classKey
                  ? b
                  : { ...b, classes: [{ classKey }], levels: [{ classKey, hp: { method: 'max' } }], knownSpells: [] },
              )
            }
            describe={(c) =>
              `${B.hitDie}: к${c.data.hitDie} · ${B.saves}: ${c.data.savingThrows.map((a) => ABILITY_LABEL_RU[a]).join(', ')}`
            }
          />
          {first && <p className="text-xs text-muted-foreground">{B.classChangeNote}</p>}
          {rules.startingLevel > 1 && <p className="text-xs text-muted-foreground">{B.startingLevelNote(rules.startingLevel)}</p>}
        </CardContent>
      </Card>
      {cls && (
        <Card>
          <CardHeader>
            <CardTitle>
              {cls.nameRu}
              {sub ? ` · ${sub.nameRu}` : ''}: {B.features.toLowerCase()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FeatureList
              features={[
                ...cls.data.features.filter((f) => (f.level ?? 1) <= Math.max(1, level)),
                ...(sub?.data.features.filter((f) => (f.level ?? 1) <= Math.max(1, level)) ?? []),
              ]}
              statusLabels={ru.sheet.automated}
            />
          </CardContent>
        </Card>
      )}
      <ChoicesBlock title={B.choicesFor(cls?.nameRu ?? '')} choices={choices} onChoice={onChoice} />
    </>
  );
}
