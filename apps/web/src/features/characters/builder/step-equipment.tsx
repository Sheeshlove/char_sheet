'use client';
import { rollFormula, STARTING_GOLD_KEY, startingEquipmentGroups } from '@ps/rules-engine';
import { DicesIcon } from 'lucide-react';
import { ru } from '@/i18n/ru';
import { diceRu } from '@/lib/format';
import { secureRandom } from '@/lib/random';
import { Markdown } from '@/components/markdown';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { StepProps } from './types';

const E = ru.builder.equipment;

export function EquipmentStep({ build, update, content, rules }: StepProps) {
  const cls = build.classes[0] ? content.index.getOf(build.classes[0].classKey, 'class') : undefined;
  const bg = build.background ? content.index.getOf(build.background, 'background') : undefined;
  const groups = startingEquipmentGroups(build, content.index);
  const goldChoice = build.choices[STARTING_GOLD_KEY]?.[0];
  const allowKit = rules.startingGoldMode !== 'gold' && groups.length > 0;
  const allowGold = rules.startingGoldMode !== 'equipment' || groups.length === 0;
  const mode: 'kit' | 'gold' = goldChoice !== undefined || !allowKit ? 'gold' : 'kit';
  const setChoice = (key: string, v: string[] | undefined) =>
    update((b) => {
      const choices = { ...b.choices };
      if (v) choices[key] = v;
      else delete choices[key];
      return { ...b, choices };
    });

  if (!cls) return <p className="text-muted-foreground">{E.noClass}</p>;
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{mode === 'kit' ? E.kit : E.gold}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {allowKit && allowGold && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={mode === 'kit' ? 'default' : 'outline'} onClick={() => setChoice(STARTING_GOLD_KEY, undefined)}>
                {E.modeKit}
              </Button>
              <Button size="sm" variant={mode === 'gold' ? 'default' : 'outline'} onClick={() => setChoice(STARTING_GOLD_KEY, ['0'])}>
                {E.modeGold}
              </Button>
            </div>
          )}
          {mode === 'kit' &&
            groups.map((g, gi) => (
              <fieldset key={g.key} className="grid gap-1 rounded-lg border p-3">
                <legend className="px-1 text-xs text-muted-foreground">{gi + 1}</legend>
                {g.options.map((o) => {
                  const id = `${g.key}-${o.index}`;
                  const checked = (build.choices[g.key]?.[0] ?? (g.options.length === 1 ? '0' : undefined)) === String(o.index);
                  return (
                    <Label key={o.index} htmlFor={id} className="flex min-h-9 cursor-pointer items-start gap-2 rounded-md px-2 py-1 font-normal hover:bg-accent">
                      <input
                        id={id}
                        type="radio"
                        name={g.key}
                        className="mt-1 accent-primary"
                        checked={checked}
                        onChange={() => setChoice(g.key, [String(o.index)])}
                      />
                      <span>
                        {g.options.length > 1 && <span className="mr-1 text-muted-foreground">{E.option(o.index)}:</span>}
                        {o.items.map((it) => (it.qty > 1 ? `${it.nameRu} ×${it.qty}` : it.nameRu)).join(', ')}
                      </span>
                    </Label>
                  );
                })}
                {g.options.map((o) => {
                  const checked = (build.choices[g.key]?.[0] ?? (g.options.length === 1 ? '0' : undefined)) === String(o.index);
                  if (!checked) return null;
                  return o.items
                    .filter((it) => it.choiceKey && it.options?.length)
                    .map((it) => (
                      <div key={it.choiceKey} className="flex flex-wrap items-center gap-2 pl-8 text-sm">
                        <span className="text-muted-foreground">{it.nameRu}:</span>
                        <Select value={build.choices[it.choiceKey!]?.[0] ?? ''} onValueChange={(v) => setChoice(it.choiceKey!, [v])}>
                          <SelectTrigger className="h-8 w-56" aria-label={it.nameRu}>
                            <SelectValue placeholder={E.pick} />
                          </SelectTrigger>
                          <SelectContent>
                            {it.options!.map((x) => (
                              <SelectItem key={x.key} value={x.key}>
                                {x.nameRu}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ));
                })}
              </fieldset>
            ))}
          {mode === 'kit' && groups.length === 0 && <p className="text-sm text-muted-foreground">{E.noGroups}</p>}
          {mode === 'gold' && (
            <div className="flex flex-wrap items-end gap-2">
              <Field label={E.goldAmount} htmlFor="start-gold" hint={cls.data.startingGold ? E.goldFormula(diceRu(cls.data.startingGold)) : undefined}>
                <Input
                  id="start-gold"
                  type="number"
                  min={0}
                  max={100000}
                  className="w-32"
                  value={goldChoice ?? '0'}
                  onChange={(e) => setChoice(STARTING_GOLD_KEY, [String(Math.max(0, Math.floor(Number(e.target.value) || 0)))])}
                />
              </Field>
              {cls.data.startingGold && (
                <Button
                  variant="outline"
                  onClick={() => {
                    const r = rollFormula(cls.data.startingGold, secureRandom);
                    if (r) setChoice(STARTING_GOLD_KEY, [String(r.total)]);
                  }}
                >
                  <DicesIcon />
                  {E.rollGold}
                </Button>
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground">{E.afterFinish}</p>
        </CardContent>
      </Card>
      {bg && (
        <Card>
          <CardHeader>
            <CardTitle>{E.backgroundEquipment}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {bg.data.equipmentMd && <Markdown>{bg.data.equipmentMd}</Markdown>}
            {bg.data.gold > 0 && <p className="text-muted-foreground">{E.backgroundGold(bg.data.gold)}</p>}
          </CardContent>
        </Card>
      )}
    </>
  );
}
