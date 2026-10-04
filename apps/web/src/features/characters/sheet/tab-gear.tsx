'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { MinusIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import type { ContentEntity, Currency, InventoryItem } from '@ps/content-schema';
import { ru } from '@/i18n/ru';
import { formatWeight } from '@/lib/format';
import { cn } from '@/lib/utils';
import { entityHref } from '@/features/library/library-list';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Section } from './bits';
import { useSheet } from './context';

const S = ru.sheet;
const COINS = ['cp', 'sp', 'ep', 'gp', 'pp'] as const;
const ITEM_KINDS = ['weapon', 'armor', 'gear', 'tool', 'item'] as const;

function itemWeight(e: ContentEntity | undefined, it: InventoryItem): number {
  if (it.customWeightLb !== undefined) return it.customWeightLb;
  const d = e?.data as { weightLb?: number } | undefined;
  return d?.weightLb ?? 0;
}

function needsAttunement(e: ContentEntity | undefined): boolean {
  return e?.kind === 'item' && e.data.attunement !== false;
}

function CurrencyBlock() {
  const { character, run, canEditState } = useSheet();
  const [draft, setDraft] = useState<Currency | null>(null);
  const cur = draft ?? character.state.currency;
  return (
    <Section title={S.currency}>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft) run({ type: 'set_currency', currency: draft }, { onDone: () => setDraft(null) });
        }}
      >
        <div className="grid grid-cols-5 gap-2">
          {COINS.map((c) => (
            <Field key={c} label={S.coins[c]} htmlFor={`coin-${c}`}>
              <Input
                id={`coin-${c}`}
                type="number"
                min={0}
                value={cur[c]}
                disabled={!canEditState}
                onChange={(e) => setDraft({ ...cur, [c]: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
              />
            </Field>
          ))}
        </div>
        {draft && (
          <Button type="submit" size="sm" className="w-fit">
            {ru.common.save}
          </Button>
        )}
      </form>
    </Section>
  );
}

function AddItemDialog() {
  const { index, run } = useSheet();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const [weight, setWeight] = useState('');
  const results = useMemo(() => {
    if (!index || q.trim().length < 2) return [];
    const needle = q.trim().toLowerCase();
    return ITEM_KINDS.flatMap((k) => index.byKind(k))
      .filter((e) => e.nameRu.toLowerCase().includes(needle) || e.nameEn?.toLowerCase().includes(needle))
      .slice(0, 30);
  }, [index, q]);
  const add = (item: Omit<InventoryItem, 'id'>) => run({ type: 'inventory_add', item });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <PlusIcon />
          {S.addItem}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{S.addItem}</DialogTitle>
        </DialogHeader>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={S.findItem} aria-label={S.findItem} autoFocus />
        <ul className="grid max-h-64 gap-0.5 overflow-y-auto">
          {results.map((e) => (
            <li key={e.key}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                onClick={() => add({ key: e.key, qty: 1, equipped: false, attuned: false })}
              >
                <span>{e.nameRu}</span>
                <span className="text-xs text-muted-foreground">{ru.library.kinds[e.kind as keyof typeof ru.library.kinds] ?? e.kind}</span>
              </button>
            </li>
          ))}
        </ul>
        <form
          className="grid gap-2 border-t pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            add({ customName: name.trim(), customWeightLb: Math.max(0, Number(weight) || 0), qty: 1, equipped: false, attuned: false });
            setName('');
            setWeight('');
          }}
        >
          <p className="text-sm font-medium">{S.customItem}</p>
          <div className="grid grid-cols-[1fr_7rem] gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={S.customName} aria-label={S.customName} maxLength={200} />
            <Input type="number" min={0} step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder={S.customWeight} aria-label={S.customWeight} />
          </div>
          <DialogFooter>
            <Button type="submit" size="sm" disabled={!name.trim()}>
              {ru.common.add}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TabGear() {
  const { character, sheet, index, run, canEditState } = useSheet();
  const inv = character.state.inventory;
  const car = sheet.carrying;
  const upd = (id: string, patch: Partial<InventoryItem>) => run({ type: 'inventory_update', id, patch });
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Section title={S.inventory} actions={canEditState && <AddItemDialog />}>
        {inv.length === 0 ? (
          <p className="text-sm text-muted-foreground">{S.noItems}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{S.item}</TableHead>
                <TableHead>{S.qty}</TableHead>
                <TableHead className="hidden sm:table-cell">{S.weight}</TableHead>
                <TableHead>{S.equipped}</TableHead>
                <TableHead className="sr-only">{ru.common.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inv.map((it) => {
                const e = it.key ? index?.get(it.key) : undefined;
                const isWeapon = e?.kind === 'weapon' || (e?.kind === 'item' && e.data.itemType === 'weapon');
                const isShield = (e?.kind === 'armor' && e.data.category === 'shield') || (e?.kind === 'item' && e.data.itemType === 'shield');
                const nameText = it.customName ?? e?.nameRu ?? it.key ?? '?';
                return (
                  <TableRow key={it.id} data-testid="inventory-row">
                    <TableCell>
                      <div className="font-medium">
                        {e ? (
                          <Link href={entityHref(e.key, e.kind)} target="_blank" className="hover:underline">
                            {nameText}
                          </Link>
                        ) : (
                          nameText
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {needsAttunement(e) && (
                          <label className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Switch checked={it.attuned} disabled={!canEditState} onCheckedChange={(v) => upd(it.id, { attuned: v })} />
                            {S.attuned}
                          </label>
                        )}
                        {it.equipped && (isWeapon || isShield) && (
                          <Select value={it.hand ?? 'main'} onValueChange={(v) => upd(it.id, { hand: v as InventoryItem['hand'] })} disabled={!canEditState}>
                            <SelectTrigger className="h-7 w-36 text-xs" aria-label={S.hand}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(['main', 'off', 'both'] as const).map((h) => (
                                <SelectItem key={h} value={h}>
                                  {S.hands[h]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        {it.charges !== undefined && <Badge variant="outline">{S.charges}: {it.charges}</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`${S.qty} −1`}
                          disabled={!canEditState}
                          onClick={() => (it.qty <= 1 ? run({ type: 'inventory_remove', id: it.id }) : upd(it.id, { qty: it.qty - 1 }))}
                        >
                          <MinusIcon />
                        </Button>
                        <span className="w-6 text-center tabular-nums">{it.qty}</span>
                        <Button size="icon-sm" variant="ghost" aria-label={`${S.qty} +1`} disabled={!canEditState} onClick={() => upd(it.id, { qty: it.qty + 1 })}>
                          <PlusIcon />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">{formatWeight(itemWeight(e, it) * it.qty)}</TableCell>
                    <TableCell>
                      <Switch
                        aria-label={`${S.equipped}: ${nameText}`}
                        checked={it.equipped}
                        disabled={!canEditState}
                        onCheckedChange={(v) => upd(it.id, { equipped: v, ...(v && isWeapon && !it.hand ? { hand: 'main' as const } : {}) })}
                      />
                    </TableCell>
                    <TableCell>
                      <Button size="icon-sm" variant="ghost" aria-label={`${S.removeItem}: ${nameText}`} disabled={!canEditState} onClick={() => run({ type: 'inventory_remove', id: it.id })}>
                        <Trash2Icon />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Section>
      <div className="grid content-start gap-4">
        <CurrencyBlock />
        <Section title={S.carrying}>
          <p className="text-sm">{S.weightOf(formatWeight(car.weightLb), formatWeight(car.capacityLb))}</p>
          <p className={cn('text-sm', car.status !== 'ok' && 'text-warning')}>{S.carryingStatus[car.status]}</p>
        </Section>
      </div>
    </div>
  );
}
