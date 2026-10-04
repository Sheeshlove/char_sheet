'use client';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ABILITIES, SKILLS } from '@ps/content-schema';
import { ABILITY_LABEL_RU, checkExpr, SKILL_LABEL_RU } from '@ps/rules-engine';
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, SearchIcon, XIcon } from 'lucide-react';
import { useTRPC } from '@/lib/trpc/client';
import { ru } from '@/i18n/ru';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { def, defaultOf, enumLabel, fieldLabel, resolve, special, unionIndex, variantLabel, type Schema } from './zod-walk';

const H = ru.homebrew;

// ─── Цели эффектов ───────────────────────────────────────────────────────

function targetOptions(kind: 'statTarget' | 'rollTarget' | 'profTarget'): { value: string; label: string }[] {
  const L = H.statTargets;
  const P = H.targetPrefix;
  const abil = (prefix: string) => ABILITIES.map((a) => ({ value: `${prefix}:${a}`, label: `${P[prefix]}: ${ABILITY_LABEL_RU[a]}` }));
  const skills = (prefix: string) => SKILLS.map((k) => ({ value: `${prefix}:${k}`, label: `${P[prefix]}: ${SKILL_LABEL_RU[k]}` }));
  if (kind === 'profTarget') {
    return [
      ...skills('skill'),
      ...abil('save'),
      ...(['light', 'medium', 'heavy', 'shield'] as const).map((c) => ({ value: `armor:${c}`, label: `${P.armor}: ${enumLabel(c)}` })),
      ...(['simple', 'martial'] as const).map((c) => ({ value: `weapon:${c}`, label: `${P.weapon}: ${enumLabel(c)}` })),
    ];
  }
  const base = ['ac', 'initiative', 'hp_max', 'spell_dc', 'carry_capacity', 'speed:walk', 'speed:fly', 'speed:swim', 'speed:climb', 'speed:burrow', 'save:*', 'check:*', 'attack:melee_weapon', 'attack:ranged_weapon', 'attack:spell', 'damage:melee_weapon', 'damage:ranged_weapon'];
  const roll = kind === 'rollTarget' ? ['attack:*', 'death_save', 'concentration'] : [];
  return [
    ...[...base, ...roll].map((v) => ({ value: v, label: L[v] ?? v })),
    ...abil('save'),
    ...abil('check'),
    ...skills('skill'),
    ...(kind === 'statTarget' ? skills('passive') : []),
  ];
}

const CUSTOM = '__custom';

function TargetInput({ kind, value, onChange, label }: { kind: 'statTarget' | 'rollTarget' | 'profTarget'; value: string; onChange: (v: string) => void; label: string }) {
  const options = useMemo(() => targetOptions(kind), [kind]);
  const known = options.some((o) => o.value === value);
  const [custom, setCustom] = useState(!known && !!value);
  return (
    <div className="grid gap-1">
      <Select
        value={custom ? CUSTOM : known ? value : undefined}
        onValueChange={(v) => {
          if (v === CUSTOM) setCustom(true);
          else {
            setCustom(false);
            onChange(v);
          }
        }}
      >
        <SelectTrigger size="sm" aria-label={label}>
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent className="max-h-80">
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM}>…</SelectItem>
        </SelectContent>
      </Select>
      {custom && <Input className="h-8 font-mono text-xs" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} placeholder="weapon:longsword" />}
    </div>
  );
}

// ─── Выражения и ключи контента ──────────────────────────────────────────

function ExprInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const res = value.trim() ? checkExpr(value) : null;
  return (
    <div className="grid gap-0.5">
      <Input className="h-8 font-mono text-sm" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} maxLength={500} aria-invalid={res ? !res.ok : undefined} />
      {res && (
        <span className={cn('text-[11px]', res.ok ? 'text-muted-foreground' : 'text-destructive')} data-testid="expr-check">
          {res.ok ? H.exprOk(String(res.value)) : H.exprError(res.error)}
        </span>
      )}
    </div>
  );
}

function ContentKeyInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const trpc = useTRPC();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const found = useQuery({ ...trpc.content.search.queryOptions({ q: q.trim() || '-', limit: 10 }), enabled: open && q.trim().length >= 2 });
  const current = useQuery({ ...trpc.content.get.queryOptions({ key: value }), enabled: /^[a-z0-9-]+\/[a-z_]+\/.+/.test(value), retry: false });
  return (
    <div className="grid gap-0.5">
      <div className="flex gap-1">
        <Input className="h-8 font-mono text-xs" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} placeholder="srd/spell/fire-bolt" />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" size="icon-sm" variant="outline" aria-label={H.pickContent} title={H.pickContent}>
              <SearchIcon />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={H.pickContent} aria-label={H.pickContent} className="mb-2 h-8" autoFocus />
            <ul className="max-h-60 overflow-y-auto">
              {found.data?.map((e) => (
                <li key={e.key}>
                  <button
                    type="button"
                    className="flex w-full justify-between gap-2 rounded px-2 py-1 text-left text-sm hover:bg-accent"
                    onClick={() => {
                      onChange(e.key);
                      setOpen(false);
                    }}
                  >
                    <span className="truncate">{e.nameRu}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{ru.library.kinds[e.kind]}</span>
                  </button>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      </div>
      {current.data && <span className="text-[11px] text-muted-foreground">{current.data.nameRu}</span>}
    </div>
  );
}

// ─── Поле по схеме ───────────────────────────────────────────────────────

type FieldProps = {
  schema: Schema;
  value: unknown;
  onChange: (v: unknown) => void;
  name?: string;
  depth?: number;
  /** Контекст подписи вариантов (тип эффекта). */
  context?: 'effectType';
};

function FieldShell({ label, children, inline = false }: { label?: string; children: React.ReactNode; inline?: boolean }) {
  if (!label) return <>{children}</>;
  return (
    <div className={cn('grid gap-1', inline && 'flex items-center gap-2')}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

const LONG_TEXT = new Set(['textMd', 'ageMd', 'alignmentMd', 'equipmentMd', 'higherLevelsMd']);

export function SchemaField({ schema, value, onChange, name, depth = 0, context }: FieldProps) {
  const s = resolve(schema);
  const d = def(s);
  const label = fieldLabel(name);

  switch (d.type) {
    case 'optional': {
      const inner = d.innerType!;
      if (value === undefined) {
        return (
          <Button type="button" variant="ghost" size="sm" className="h-7 justify-self-start px-2 text-xs text-muted-foreground" onClick={() => onChange(defaultOf(inner, name) ?? '')}>
            <PlusIcon />
            {label || H.include}
          </Button>
        );
      }
      return (
        <div className="relative">
          <SchemaField schema={inner} value={value} onChange={onChange} name={name} depth={depth} context={context} />
          <Button type="button" size="icon-sm" variant="ghost" className="absolute -top-1 right-0 size-6" aria-label={`${H.remove}: ${label}`} onClick={() => onChange(undefined)}>
            <XIcon />
          </Button>
        </div>
      );
    }
    case 'nullable': {
      const inner = d.innerType!;
      return (
        <div className="grid gap-1">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={value === null} onCheckedChange={(v) => onChange(v ? null : defaultOf(inner, name))} />
            {label}: {ru.common.none}
          </label>
          {value !== null && <SchemaField schema={inner} value={value} onChange={onChange} name={name} depth={depth} />}
        </div>
      );
    }
    case 'default':
      return <SchemaField schema={d.innerType!} value={value} onChange={onChange} name={name} depth={depth} context={context} />;
    case 'string': {
      const sp = special(s);
      const v = typeof value === 'string' ? value : '';
      if (sp === 'expr') return <FieldShell label={label}><ExprInput value={v} onChange={onChange} label={label} /></FieldShell>;
      if (sp === 'contentKey') return <FieldShell label={label}><ContentKeyInput value={v} onChange={onChange} label={label} /></FieldShell>;
      if (sp) return <FieldShell label={label}><TargetInput kind={sp} value={v} onChange={onChange} label={label} /></FieldShell>;
      return (
        <FieldShell label={label}>
          {name && LONG_TEXT.has(name) ? (
            <Textarea value={v} onChange={(e) => onChange(e.target.value)} aria-label={label} rows={3} />
          ) : (
            <Input className="h-8" value={v} onChange={(e) => onChange(e.target.value)} aria-label={label} />
          )}
        </FieldShell>
      );
    }
    case 'number': {
      const n = s as unknown as { minValue?: number | null; maxValue?: number | null; isInt?: boolean };
      return (
        <FieldShell label={label}>
          <Input
            className="h-8 w-28"
            type="number"
            value={typeof value === 'number' ? value : ''}
            min={Number.isFinite(n.minValue) ? (n.minValue ?? undefined) : undefined}
            max={Number.isFinite(n.maxValue) ? (n.maxValue ?? undefined) : undefined}
            step={n.isInt ? 1 : 'any'}
            onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
            aria-label={label}
          />
        </FieldShell>
      );
    }
    case 'boolean':
      return (
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={value === true} onCheckedChange={(v) => onChange(v)} aria-label={label} />
          {label}
        </label>
      );
    case 'enum': {
      const values = Object.values(d.entries ?? {});
      return (
        <FieldShell label={label}>
          <Select value={typeof value === 'string' ? value : undefined} onValueChange={onChange}>
            <SelectTrigger size="sm" aria-label={label}>
              <SelectValue placeholder={label} />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              {values.map((v) => (
                <SelectItem key={v} value={v}>
                  {enumLabel(v)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldShell>
      );
    }
    case 'literal':
      return null;
    case 'object':
      return <ObjectField schema={s} value={value} onChange={onChange} name={name} depth={depth} />;
    case 'array':
      return <ArrayField schema={s} value={value} onChange={onChange} name={name} depth={depth} />;
    case 'tuple': {
      const items = d.items ?? [];
      const arr = Array.isArray(value) ? value : items.map((it) => defaultOf(it));
      return (
        <FieldShell label={label}>
          <div className="flex flex-wrap gap-2">
            {items.map((it, i) => (
              <div key={i} className="min-w-32">
                <SchemaField schema={it} value={arr[i]} onChange={(v) => onChange(arr.map((x, j) => (j === i ? v : x)))} depth={depth + 1} />
              </div>
            ))}
          </div>
        </FieldShell>
      );
    }
    case 'record':
      return <RecordField value={value} onChange={onChange} label={label} />;
    case 'union':
      return <UnionField schema={s} value={value} onChange={onChange} name={name} depth={depth} context={context} />;
    default:
      return (
        <FieldShell label={label}>
          <Textarea
            className="font-mono text-xs"
            defaultValue={JSON.stringify(value ?? null, null, 2)}
            onBlur={(e) => {
              try {
                onChange(JSON.parse(e.target.value));
              } catch {
                // Некорректный JSON не применяется.
              }
            }}
            aria-label={label}
          />
        </FieldShell>
      );
  }
}

function ObjectField({ schema, value, onChange, name, depth }: FieldProps) {
  const d = def(schema);
  const obj = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  // Дискриминатор выбирается в объединении; статус автоматизации считает сервер; ключ умения — служебный.
  const entries = Object.entries(d.shape ?? {}).filter(([k, v]) => def(resolve(v)).type !== 'literal' && k !== 'effectsStatus');
  const set = (k: string, v: unknown) => {
    const next = { ...obj };
    if (v === undefined) delete next[k];
    else next[k] = v;
    onChange(next);
  };
  const body = (
    <div className="grid gap-3 sm:grid-cols-2">
      {entries.map(([k, v]) => {
        if (k === 'key' && typeof obj.key === 'string' && obj.key) {
          return (
            <div key={k} className="text-[11px] text-muted-foreground sm:col-span-2">
              {fieldLabel('key')}: <span className="font-mono">{obj.key}</span>
            </div>
          );
        }
        const t = def(resolve(v)).type;
        const inner = t === 'optional' ? def(resolve(def(resolve(v)).innerType!)).type : t;
        const wide = ['object', 'array', 'union', 'record'].includes(inner) || LONG_TEXT.has(k);
        return (
          <div key={k} className={cn(wide && 'sm:col-span-2')}>
            <SchemaField schema={v} value={obj[k]} onChange={(nv) => set(k, nv)} name={k} depth={(depth ?? 0) + 1} />
          </div>
        );
      })}
    </div>
  );
  if (!depth || !name) return body;
  return (
    <fieldset className="grid gap-2 rounded-md border p-3">
      <legend className="px-1 text-xs font-medium text-muted-foreground">{fieldLabel(name)}</legend>
      {body}
    </fieldset>
  );
}

function ArrayField({ schema, value, onChange, name, depth }: FieldProps) {
  const d = def(schema);
  const el = resolve(d.element!);
  const ed = def(el);
  const arr = Array.isArray(value) ? value : [];
  const label = fieldLabel(name);
  // Список значений перечисления — флажки.
  if (ed.type === 'enum') {
    const values = Object.values(ed.entries ?? {});
    return (
      <FieldShell label={label}>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {values.map((v) => (
            <label key={v} className="flex items-center gap-1.5 text-sm">
              <Checkbox checked={arr.includes(v)} onCheckedChange={(c) => onChange(c ? [...arr, v] : arr.filter((x) => x !== v))} />
              {enumLabel(v)}
            </label>
          ))}
        </div>
      </FieldShell>
    );
  }
  // Список строк или чисел — через запятую.
  if ((ed.type === 'string' && !special(el)) || ed.type === 'number') {
    return (
      <FieldShell label={label}>
        <Input
          className="h-8"
          defaultValue={arr.join(', ')}
          key={arr.join('|')}
          onBlur={(e) => {
            const parts = e.target.value
              .split(/[,\n]/)
              .map((x) => x.trim())
              .filter(Boolean);
            onChange(ed.type === 'number' ? parts.map(Number).filter((x) => Number.isFinite(x)) : parts);
          }}
          aria-label={label}
        />
      </FieldShell>
    );
  }
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    const next = [...arr];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const itemLabel = name === 'effects' || name === 'selfEffects' ? H.effect : name === 'features' ? H.feature : null;
  return (
    <div className="grid gap-2" data-testid={name ? `array-${name}` : undefined}>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {arr.map((item, i) => (
        <div key={i} className="grid gap-2 rounded-md border border-dashed p-3" data-testid={name ? `${name}-item` : undefined}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {itemLabel ?? H.item(i + 1)} {itemLabel ? i + 1 : ''}
            </span>
            <div className="flex gap-0.5">
              <Button type="button" size="icon-sm" variant="ghost" aria-label={H.moveUp} disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUpIcon />
              </Button>
              <Button type="button" size="icon-sm" variant="ghost" aria-label={H.moveDown} disabled={i === arr.length - 1} onClick={() => move(i, 1)}>
                <ArrowDownIcon />
              </Button>
              <Button type="button" size="icon-sm" variant="ghost" aria-label={H.remove} onClick={() => onChange(arr.filter((_, j) => j !== i))}>
                <XIcon />
              </Button>
            </div>
          </div>
          <SchemaField
            schema={d.element!}
            value={item}
            onChange={(v) => onChange(arr.map((x, j) => (j === i ? v : x)))}
            depth={(depth ?? 0) + 1}
            context={name === 'effects' || name === 'selfEffects' ? 'effectType' : undefined}
          />
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => onChange([...arr, defaultOf(d.element!)])} data-testid={name ? `add-${name}` : undefined}>
        <PlusIcon />
        {H.add}
        {itemLabel ? `: ${itemLabel.toLowerCase()}` : ''}
      </Button>
    </div>
  );
}

function UnionField({ schema, value, onChange, name, depth, context }: FieldProps) {
  const d = def(schema);
  const options = d.options ?? [];
  const disc = d.discriminator;
  const idx = unionIndex(options, value, disc);
  const label = disc ? (context === 'effectType' ? H.effectType : fieldLabel(disc)) : fieldLabel(name);
  const optLabel = (o: Schema) => {
    if (disc) {
      const v = def(def(resolve(o)).shape![disc]!).values?.[0];
      return enumLabel(v, context === 'effectType' && disc === 'type' ? 'effectType' : undefined);
    }
    return variantLabel(o);
  };
  // Объединение одних литералов (кость хитов 6/8/10/12) — простой выбор.
  if (options.every((o) => def(resolve(o)).type === 'literal')) {
    const vals = options.map((o) => def(resolve(o)).values?.[0]);
    return (
      <FieldShell label={fieldLabel(name)}>
        <Select value={value === undefined ? undefined : String(value)} onValueChange={(v) => onChange(vals.find((x) => String(x) === v))}>
          <SelectTrigger size="sm" aria-label={fieldLabel(name)}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {vals.map((v) => (
              <SelectItem key={String(v)} value={String(v)}>
                {enumLabel(v)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldShell>
    );
  }
  const current = options[idx]!;
  return (
    <div className={cn('grid gap-2', !disc && name && 'rounded-md border p-2')}>
      <FieldShell label={label || H.variant}>
        <Select
          value={String(idx)}
          onValueChange={(v) => {
            const o = options[Number(v)]!;
            onChange(defaultOf(o, name));
          }}
        >
          <SelectTrigger size="sm" aria-label={label || H.variant} data-testid={disc === 'type' && context === 'effectType' ? 'effect-type' : undefined}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            {options.map((o, i) => (
              <SelectItem key={i} value={String(i)}>
                {optLabel(o)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldShell>
      <SchemaField schema={current} value={value} onChange={onChange} depth={depth} />
    </div>
  );
}

function RecordField({ value, onChange, label }: { value: unknown; onChange: (v: unknown) => void; label: string }) {
  const obj = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, string | number>) : {};
  const rows = Object.entries(obj);
  const set = (entries: [string, string | number][]) => onChange(Object.fromEntries(entries.filter(([k]) => k)));
  return (
    <FieldShell label={label}>
      <div className="grid gap-1">
        {rows.map(([k, v], i) => (
          <div key={i} className="flex gap-1">
            <Input className="h-8" defaultValue={k} onBlur={(e) => set(rows.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))} aria-label={`${label}: ключ`} />
            <Input
              className="h-8"
              defaultValue={String(v)}
              onBlur={(e) => {
                const raw = e.target.value;
                const num = Number(raw);
                set(rows.map((r, j) => (j === i ? [r[0], raw !== '' && Number.isFinite(num) ? num : raw] : r)));
              }}
              aria-label={`${label}: значение`}
            />
            <Button type="button" size="icon-sm" variant="ghost" aria-label={H.remove} onClick={() => set(rows.filter((_, j) => j !== i))}>
              <XIcon />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => set([...rows, [`col${rows.length + 1}`, '']])}>
          <PlusIcon />
          {H.add}
        </Button>
      </div>
    </FieldShell>
  );
}
