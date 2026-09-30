'use client';
import { useMemo, useState } from 'react';
import { MinusIcon, PlusIcon } from 'lucide-react';
import { ABILITIES, type Ability } from '@ps/content-schema';
import { ABILITY_LABEL_RU, type ChoiceInfo } from '@ps/rules-engine';
import { ru } from '@/i18n/ru';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const C = ru.choices;

type Props = { choice: ChoiceInfo; onChange: (selected: string[]) => void; disabled?: boolean; id?: string };

/** Редактор любого выбора из листа: список, навыки, языки, ASI, подкласс, хиты, заклинания. */
export function ChoiceEditor({ choice, onChange, disabled, id }: Props) {
  const complete = choice.selected.length >= choice.choose;
  return (
    <fieldset
      id={id ?? `choice-${choice.key}`}
      className={cn('grid gap-2 rounded-lg border p-3', !complete && 'border-warning/60 bg-warning/5')}
      data-testid="choice"
      data-choice-key={choice.key}
      disabled={disabled}
    >
      <legend className="flex w-full flex-wrap items-center justify-between gap-2 px-1 text-sm font-medium">
        <span>{choice.labelRu}</span>
        <Badge variant={complete ? 'success' : 'warning'}>{C.selected(Math.min(choice.selected.length, choice.choose), choice.choose)}</Badge>
      </legend>
      <ChoiceBody choice={choice} onChange={onChange} />
    </fieldset>
  );
}

function ChoiceBody({ choice, onChange }: Props) {
  if (choice.kind === 'asi') return <AsiEditor choice={choice} onChange={onChange} />;
  if (choice.source?.kind === 'ability_increase') {
    return (
      <AbilityPoints
        selected={choice.selected}
        points={choice.source.points}
        maxPer={choice.source.maxPerAbility}
        allowed={(choice.source.abilities ?? [...ABILITIES]) as Ability[]}
        onChange={onChange}
      />
    );
  }
  if (choice.kind === 'hp') {
    return (
      <Select value={choice.selected[0] ?? ''} onValueChange={(v) => onChange([v])}>
        <SelectTrigger aria-label={C.hpRoll} className="w-32">
          <SelectValue placeholder={C.hpRoll} />
        </SelectTrigger>
        <SelectContent>
          {choice.options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.labelRu}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  return <OptionList choice={choice} onChange={onChange} />;
}

/** Список вариантов: один (радио) или несколько (флажки), с поиском для длинных списков. */
function OptionList({ choice, onChange }: Props) {
  const [q, setQ] = useState('');
  const single = choice.choose === 1;
  const sel = new Set(choice.selected);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? choice.options.filter((o) => o.labelRu.toLowerCase().includes(needle)) : choice.options;
  }, [choice.options, q]);
  if (!choice.options.length) return <p className="text-sm text-muted-foreground">{C.none}</p>;
  const toggle = (value: string) => {
    if (single) return onChange(sel.has(value) ? [] : [value]);
    if (sel.has(value)) return onChange(choice.selected.filter((v) => v !== value));
    if (choice.selected.length >= choice.choose) return;
    onChange([...choice.selected, value]);
  };
  const groups = groupByHint(filtered);
  return (
    <div className="grid gap-2">
      {choice.options.length > 12 && (
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={C.search} aria-label={C.search} className="h-8" />
      )}
      <div className={cn('grid gap-1', choice.options.length > 8 && 'max-h-72 overflow-y-auto pr-1')}>
        {groups.map(([hint, opts]) => (
          <div key={hint || 'all'} className="grid gap-1 sm:grid-cols-2">
            {hint && <p className="text-xs font-medium text-muted-foreground sm:col-span-2">{hint}</p>}
            {opts.map((o) => {
              const checked = sel.has(o.value);
              const blocked = !checked && !single && choice.selected.length >= choice.choose;
              const inputId = `${choice.key}::${o.value}`;
              return (
                <Label
                  key={o.value}
                  htmlFor={inputId}
                  className={cn(
                    'flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 py-1 font-normal hover:bg-accent',
                    checked && 'bg-accent',
                    (o.disabled || blocked) && 'cursor-not-allowed opacity-50',
                  )}
                >
                  <Checkbox
                    id={inputId}
                    checked={checked}
                    disabled={o.disabled || blocked}
                    onCheckedChange={() => toggle(o.value)}
                    className={single ? 'rounded-full' : undefined}
                  />
                  <span>{o.labelRu}</span>
                </Label>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function groupByHint<T extends { hintRu?: string }>(opts: T[]): [string, T[]][] {
  const out = new Map<string, T[]>();
  for (const o of opts) {
    const k = o.hintRu ?? '';
    out.set(k, [...(out.get(k) ?? []), o]);
  }
  return [...out.entries()];
}

/** Распределение очков по характеристикам (выбор увеличения характеристик). */
function AbilityPoints({
  selected,
  points,
  maxPer,
  allowed,
  onChange,
}: {
  selected: string[];
  points: number;
  maxPer: number;
  allowed: Ability[];
  onChange: (v: string[]) => void;
}) {
  const count = (a: string) => selected.filter((v) => v === a).length;
  const left = points - selected.length;
  return (
    <div className="grid gap-2">
      <p className="text-xs text-muted-foreground">{C.points(left)}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {allowed.map((a) => (
          <div key={a} className="flex items-center justify-between gap-1 rounded-md border px-2 py-1">
            <span className="text-sm">{ABILITY_LABEL_RU[a]}</span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`− ${ABILITY_LABEL_RU[a]}`}
                disabled={count(a) === 0}
                onClick={() => {
                  const i = selected.lastIndexOf(a);
                  onChange(selected.filter((_, j) => j !== i));
                }}
              >
                <MinusIcon />
              </Button>
              <span className="w-6 text-center tabular-nums">+{count(a)}</span>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`+ ${ABILITY_LABEL_RU[a]}`}
                disabled={left <= 0 || count(a) >= maxPer}
                onClick={() => onChange([...selected, a])}
              >
                <PlusIcon />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Увеличение характеристик (+2 или +1/+1) либо черта. */
function AsiEditor({ choice, onChange }: Props) {
  const feats = choice.options.filter((o) => o.value.includes('/'));
  const isFeat = choice.selected.some((v) => v.includes('/'));
  const [mode, setMode] = useState<'asi' | 'feat'>(isFeat ? 'feat' : 'asi');
  return (
    <div className="grid gap-3">
      {feats.length > 0 && (
        <div className="flex gap-2" role="radiogroup">
          <Button
            type="button"
            size="sm"
            variant={mode === 'asi' ? 'default' : 'outline'}
            aria-pressed={mode === 'asi'}
            onClick={() => {
              setMode('asi');
              if (isFeat) onChange([]);
            }}
          >
            {C.asi}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === 'feat' ? 'default' : 'outline'}
            aria-pressed={mode === 'feat'}
            onClick={() => {
              setMode('feat');
              if (!isFeat) onChange([]);
            }}
          >
            {C.feat}
          </Button>
        </div>
      )}
      {mode === 'asi' ? (
        <>
          <p className="text-xs text-muted-foreground">{C.asiHint}</p>
          <AbilityPoints
            selected={isFeat ? [] : choice.selected}
            points={2}
            maxPer={2}
            allowed={[...ABILITIES]}
            onChange={onChange}
          />
        </>
      ) : (
        <Select value={isFeat ? choice.selected[0] : ''} onValueChange={(v) => onChange([v])}>
          <SelectTrigger aria-label={C.feat}>
            <SelectValue placeholder={C.feat} />
          </SelectTrigger>
          <SelectContent>
            {feats.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.labelRu}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
