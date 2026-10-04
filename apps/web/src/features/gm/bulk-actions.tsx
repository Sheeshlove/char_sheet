'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CONDITIONS, type ConditionId, type StateCommand } from '@ps/content-schema';
import { CONDITION_LABEL_RU } from '@ps/rules-engine';
import { useTRPC } from '@/lib/trpc/client';
import { ru } from '@/i18n/ru';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const G = ru.gm;

type ActionKind =
  | 'xp_each'
  | 'xp_split'
  | 'grant_level'
  | 'short_rest'
  | 'long_rest'
  | 'damage'
  | 'heal'
  | 'add_condition'
  | 'remove_condition'
  | 'give_item'
  | 'give_coins'
  | 'inspiration';

const LABELS: Record<ActionKind, string> = {
  xp_each: G.xpEach,
  xp_split: G.xpSplit,
  grant_level: G.grantLevel,
  short_rest: G.shortRest,
  long_rest: G.longRest,
  damage: G.damage,
  heal: G.heal,
  add_condition: G.addCondition,
  remove_condition: G.removeCondition,
  give_item: G.giveItem,
  give_coins: G.giveCoins,
  inspiration: G.giveInspiration,
};

const COINS = ['cp', 'sp', 'ep', 'gp', 'pp'] as const;
const CONDITION_CHOICES = CONDITIONS.filter((c) => c !== 'exhaustion');

/** Массовые действия мастера над выбранными персонажами (SPEC §13) → `characters.bulkCommand`. */
export function BulkActions({ campaignId, selected, milestone }: { campaignId: string; selected: string[]; milestone: boolean }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [action, setAction] = useState<ActionKind | null>(null);
  const [amount, setAmount] = useState('');
  const [condition, setCondition] = useState<ConditionId>('poisoned');
  const [coins, setCoins] = useState<Record<string, string>>({});
  const [itemQuery, setItemQuery] = useState('');
  const [itemKey, setItemKey] = useState<{ key: string; name: string } | null>(null);
  const [customName, setCustomName] = useState('');
  const [qty, setQty] = useState('1');
  const items = useQuery({
    ...trpc.content.search.queryOptions({ q: itemQuery.trim() || '-', kinds: ['item', 'weapon', 'armor', 'gear', 'tool'], limit: 8 }),
    enabled: action === 'give_item' && itemQuery.trim().length >= 2,
  });
  const bulk = useMutation(
    trpc.characters.bulkCommand.mutationOptions({
      onSuccess: (r) => {
        toast.success(G.done(r.updated));
        void qc.invalidateQueries({ queryKey: trpc.characters.listByCampaign.queryKey({ campaignId }) });
        void qc.invalidateQueries({ queryKey: trpc.characters.campaignEvents.pathKey() });
        setAction(null);
      },
    }),
  );
  const open = (a: ActionKind) => {
    setAction(a);
    setAmount('');
    setCoins({});
    setItemKey(null);
    setItemQuery('');
    setCustomName('');
    setQty('1');
  };
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  const run = () => {
    if (!action) return;
    const characterIds = selected;
    const cmd = (command: StateCommand) => bulk.mutate({ campaignId, characterIds, action: { kind: 'command', command } });
    switch (action) {
      case 'xp_each':
        return bulk.mutate({ campaignId, characterIds, action: { kind: 'xp_each', amount: n } });
      case 'xp_split':
        return bulk.mutate({ campaignId, characterIds, action: { kind: 'xp_split', total: n } });
      case 'grant_level':
        return cmd({ type: 'grant_level' });
      case 'short_rest':
        return cmd({ type: 'short_rest', hitDice: [] });
      case 'long_rest':
        return cmd({ type: 'long_rest' });
      case 'damage':
        return cmd({ type: 'damage', amount: n });
      case 'heal':
        return cmd({ type: 'heal', amount: n });
      case 'add_condition':
        return cmd({ type: 'add_condition', condition });
      case 'remove_condition':
        return cmd({ type: 'remove_condition', condition });
      case 'inspiration':
        return cmd({ type: 'set_inspiration', value: true });
      case 'give_coins': {
        const currency = Object.fromEntries(COINS.map((c) => [c, Math.max(0, Math.floor(Number(coins[c]) || 0))]).filter(([, v]) => v));
        return cmd({ type: 'add_currency', currency });
      }
      case 'give_item': {
        const q = Math.max(1, Math.floor(Number(qty) || 1));
        return cmd({
          type: 'inventory_add',
          item: itemKey
            ? { key: itemKey.key, qty: q, equipped: false, attuned: false }
            : { customName: customName.trim(), qty: q, equipped: false, attuned: false },
        });
      }
    }
  };
  const needsAmount = action === 'xp_each' || action === 'xp_split' || action === 'damage' || action === 'heal';
  const valid =
    (!needsAmount || n > 0) &&
    (action !== 'give_item' || !!itemKey || !!customName.trim()) &&
    (action !== 'give_coins' || COINS.some((c) => Number(coins[c]) > 0));
  const kinds: ActionKind[] = [
    'xp_each',
    'xp_split',
    ...(milestone ? (['grant_level'] as const) : []),
    'short_rest',
    'long_rest',
    'damage',
    'heal',
    'add_condition',
    'remove_condition',
    'give_item',
    'give_coins',
    'inspiration',
  ];

  return (
    <div className="grid gap-2" data-testid="bulk-actions">
      <div className="text-sm font-medium">{G.actions}</div>
      {!selected.length && <p className="text-xs text-muted-foreground">{G.noSelection}</p>}
      <div className="flex flex-wrap gap-1.5">
        {kinds.map((k) => (
          <Button key={k} size="sm" variant="outline" disabled={!selected.length} onClick={() => open(k)} data-testid={`bulk-${k}`}>
            {LABELS[k]}
          </Button>
        ))}
      </div>
      <Dialog open={action !== null} onOpenChange={(o) => !o && setAction(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{action ? LABELS[action] : ''}</DialogTitle>
            <DialogDescription>
              {G.selected(selected.length)}
              {action === 'short_rest' && ` · ${G.shortRestHint}`}
              {action === 'grant_level' && ` · ${G.grantLevelHint}`}
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid) run();
            }}
          >
            {needsAmount && (
              <div className="grid gap-1">
                <Label htmlFor="bulk-amount">{action === 'xp_each' || action === 'xp_split' ? G.xpAmount : G.amount}</Label>
                <Input id="bulk-amount" type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
                {action === 'xp_split' && n > 0 && <p className="text-xs text-muted-foreground">{G.xpSplitHint(n, selected.length)}</p>}
              </div>
            )}
            {(action === 'add_condition' || action === 'remove_condition') && (
              <Select value={condition} onValueChange={(v) => setCondition(v as ConditionId)}>
                <SelectTrigger aria-label={G.condition}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONDITION_CHOICES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CONDITION_LABEL_RU[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {action === 'give_coins' && (
              <div className="grid grid-cols-5 gap-2">
                {COINS.map((c) => (
                  <div key={c} className="grid gap-1">
                    <Label htmlFor={`coin-${c}`} className="text-xs">
                      {ru.sheet.coins[c]}
                    </Label>
                    <Input id={`coin-${c}`} type="number" min={0} value={coins[c] ?? ''} onChange={(e) => setCoins((o) => ({ ...o, [c]: e.target.value }))} />
                  </div>
                ))}
              </div>
            )}
            {action === 'give_item' && (
              <div className="grid gap-2">
                <Input
                  value={itemQuery}
                  onChange={(e) => {
                    setItemQuery(e.target.value);
                    setItemKey(null);
                  }}
                  placeholder={G.itemSearch}
                  aria-label={G.itemSearch}
                />
                {!itemKey && items.data && items.data.length > 0 && (
                  <ul className="grid max-h-40 gap-0.5 overflow-y-auto rounded-md border p-1">
                    {items.data.map((it) => (
                      <li key={it.key}>
                        <button
                          type="button"
                          className="w-full rounded px-2 py-1 text-left text-sm hover:bg-accent"
                          onClick={() => {
                            setItemKey({ key: it.key, name: it.nameRu });
                            setItemQuery(it.nameRu);
                          }}
                        >
                          {it.nameRu} <span className="text-xs text-muted-foreground">{ru.library.kinds[it.kind]}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {!itemKey && (
                  <Input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder={G.customItemName} aria-label={G.customItem} maxLength={200} />
                )}
                <div className="grid w-32 gap-1">
                  <Label htmlFor="bulk-qty" className="text-xs">
                    {G.qty}
                  </Label>
                  <Input id="bulk-qty" type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button type="submit" disabled={!valid || bulk.isPending} data-testid="bulk-apply">
                {G.apply}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
