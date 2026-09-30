'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckIcon, ChevronsUpDownIcon, XIcon } from 'lucide-react';
import { useTRPC } from '@/lib/trpc/client';
import { ru } from '@/i18n/ru';
import {
  ATTITUDES,
  CLUE_RELIABILITY,
  NPC_STATUSES,
  QUEST_STATUSES,
  type AnyNoteFields,
  type NoteType,
} from '@/lib/notes/schema';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const N = ru.notes;
const NONE = '__none';

export type RefLabels = Map<string, string>;

function Row({ label, children, htmlFor }: { label: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function EnumSelect({
  value,
  options,
  labels,
  onChange,
  disabled,
  label,
}: {
  value: string | undefined;
  options: readonly (string | number)[];
  labels: Record<string, string>;
  onChange: (v: string) => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <Select value={value === undefined ? undefined : String(value)} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger size="sm" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={String(o)}>
            {labels[String(o)]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Выбор заметки для поля-ссылки (место, фракция, квестодатель…). */
export function NoteRefPicker({
  campaignId,
  value,
  label,
  onChange,
  disabled,
  exclude,
  ariaLabel,
}: {
  campaignId: string | null;
  value: string | undefined;
  label: string | undefined;
  onChange: (id: string | undefined, label?: string) => void;
  disabled: boolean;
  exclude?: string;
  ariaLabel: string;
}) {
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const found = useQuery({ ...trpc.notes.lookup.queryOptions({ campaignId, q, limit: 10 }), enabled: open });
  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="min-w-0 flex-1 justify-between font-normal" disabled={disabled} aria-label={ariaLabel}>
            <span className="truncate">{value ? (label ?? '…') : N.noneSelected}</span>
            <ChevronsUpDownIcon className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={N.pickNote} aria-label={N.pickNote} className="mb-2 h-8" autoFocus />
          <ul className="max-h-60 overflow-y-auto">
            {found.data
              ?.filter((n) => n.id !== exclude)
              .map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                    onClick={() => {
                      onChange(n.id, n.title);
                      setOpen(false);
                    }}
                  >
                    <span className="truncate">{n.title || N.untitled}</span>
                    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      {N.types[n.type]}
                      {n.id === value && <CheckIcon className="size-3" />}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </PopoverContent>
      </Popover>
      {value && !disabled && (
        <Button size="icon-sm" variant="ghost" aria-label={ru.common.reset} onClick={() => onChange(undefined)}>
          <XIcon />
        </Button>
      )}
    </div>
  );
}

/** Персонажи области: кампании или свои. */
export function useScopeCharacters(campaignId: string | null) {
  const trpc = useTRPC();
  const campaign = useQuery({ ...trpc.characters.listByCampaign.queryOptions({ campaignId: campaignId ?? '' }), enabled: !!campaignId });
  const mine = useQuery({ ...trpc.characters.listMine.queryOptions(), enabled: !campaignId });
  return (campaignId ? campaign.data : mine.data)?.map((c) => ({ id: c.id, name: c.name })) ?? [];
}

/** Поля типа заметки (§11.2). */
export function NoteFields({
  noteId,
  campaignId,
  type,
  fields,
  refLabels,
  onChange,
  disabled,
}: {
  noteId: string;
  campaignId: string | null;
  type: NoteType;
  fields: AnyNoteFields;
  refLabels: RefLabels;
  onChange: (fields: AnyNoteFields, label?: { id: string; label: string }) => void;
  disabled: boolean;
}) {
  const chars = useScopeCharacters(campaignId);
  const set = (k: string, v: unknown, label?: { id: string; label: string }) => {
    const next = { ...fields };
    if (v === undefined || v === '' || (Array.isArray(v) && !v.length && k !== 'participants')) delete next[k];
    else next[k] = v;
    onChange(next, label);
  };
  const str = (k: string) => (typeof fields[k] === 'string' ? (fields[k] as string) : undefined);
  const noteRef = (k: string) => (
    <Row label={N.fields[k]!}>
      <NoteRefPicker
        campaignId={campaignId}
        value={str(k)}
        label={str(k) ? refLabels.get(str(k)!) : undefined}
        onChange={(id, label) => set(k, id, id && label ? { id, label } : undefined)}
        disabled={disabled}
        exclude={noteId}
        ariaLabel={N.fields[k]!}
      />
    </Row>
  );
  const enumRow = (k: string, options: readonly (string | number)[], labels: Record<string, string>) => (
    <Row label={N.fields[k]!}>
      <EnumSelect
        value={fields[k] === undefined ? undefined : String(fields[k])}
        options={options}
        labels={labels}
        onChange={(v) => set(k, k === 'priority' ? Number(v) : v)}
        disabled={disabled}
        label={N.fields[k]!}
      />
    </Row>
  );
  const numRow = (k: string) => (
    <Row label={N.fields[k]!} htmlFor={`nf-${k}`}>
      <Input
        id={`nf-${k}`}
        type="number"
        min={0}
        className="h-8"
        value={typeof fields[k] === 'number' ? String(fields[k]) : ''}
        disabled={disabled}
        onChange={(e) => set(k, e.target.value === '' ? undefined : Math.max(0, Math.floor(Number(e.target.value))))}
      />
    </Row>
  );
  const textRow = (k: string, max: number) => (
    <Row label={N.fields[k]!} htmlFor={`nf-${k}`}>
      <Input id={`nf-${k}`} className="h-8" maxLength={max} value={str(k) ?? ''} disabled={disabled} onChange={(e) => set(k, e.target.value)} />
    </Row>
  );
  const charSelect = (k: string) => (
    <Row label={N.fields[k]!}>
      <Select value={str(k) ?? NONE} onValueChange={(v) => set(k, v === NONE ? undefined : v)} disabled={disabled}>
        <SelectTrigger size="sm" aria-label={N.fields[k]}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{N.noneSelected}</SelectItem>
          {chars.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Row>
  );

  switch (type) {
    case 'session': {
      const parts = Array.isArray(fields.participants) ? (fields.participants as string[]) : [];
      return chars.length ? (
        <Row label={N.fields.participants!}>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {chars.map((c) => (
              <label key={c.id} className="flex items-center gap-1.5 text-sm">
                <Checkbox
                  checked={parts.includes(c.id)}
                  disabled={disabled}
                  onCheckedChange={(v) => set('participants', v ? [...parts, c.id] : parts.filter((p) => p !== c.id))}
                />
                {c.name}
              </label>
            ))}
          </div>
        </Row>
      ) : null;
    }
    case 'npc':
      return (
        <Grid>
          {enumRow('status', NPC_STATUSES, N.npcStatus)}
          {enumRow('attitude', ATTITUDES, N.attitudes)}
          {noteRef('location')}
          {noteRef('faction')}
          {numRow('firstMetSession')}
        </Grid>
      );
    case 'location':
      return (
        <Grid>
          {textRow('region', 200)}
          {noteRef('parent')}
        </Grid>
      );
    case 'quest':
      return (
        <Grid>
          {enumRow('status', QUEST_STATUSES, N.questStatus)}
          {enumRow('priority', [1, 2, 3], N.priorities)}
          {noteRef('giver')}
          {textRow('rewardRu', 500)}
        </Grid>
      );
    case 'faction':
      return (
        <Grid>
          {enumRow('attitude', ATTITUDES, N.attitudes)}
          {noteRef('leader')}
        </Grid>
      );
    case 'item':
      return (
        <Grid>
          {charSelect('holder')}
          {numRow('foundSession')}
        </Grid>
      );
    case 'clue':
      return (
        <Grid>
          {enumRow('reliability', CLUE_RELIABILITY, N.reliability)}
          {textRow('sourceRu', 300)}
        </Grid>
      );
    default:
      return null;
  }
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className={cn('grid gap-3 sm:grid-cols-2')}>{children}</div>;
}
