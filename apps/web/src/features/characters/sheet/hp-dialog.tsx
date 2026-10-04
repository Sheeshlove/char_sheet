'use client';
import { useState } from 'react';
import { DeleteIcon } from 'lucide-react';
import { DAMAGE_TYPES, type DamageType } from '@ps/content-schema';
import { DAMAGE_TYPE_LABEL_RU } from '@ps/rules-engine';
import { ru } from '@/i18n/ru';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSheet } from './context';

const S = ru.sheet;
export type HpAction = 'damage' | 'heal' | 'temp';
const TITLES: Record<HpAction, string> = { damage: S.damageBtn, heal: S.healBtn, temp: S.tempBtn };
const ANY = 'any';

/** Урон / лечение / временные хиты с цифровой клавиатурой (игровой режим, SPEC §12.2). */
export function HpDialog({ action, onClose }: { action: HpAction | null; onClose: () => void }) {
  const { run } = useSheet();
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<string>(ANY);
  const [critical, setCritical] = useState(false);
  const [magical, setMagical] = useState(false);
  const close = () => {
    setAmount('');
    setType(ANY);
    setCritical(false);
    setMagical(false);
    onClose();
  };
  const n = Math.min(9999, Number(amount) || 0);
  const apply = () => {
    if (!action || n <= 0) return;
    if (action === 'damage') {
      run({
        type: 'damage',
        amount: n,
        ...(type !== ANY ? { damageType: type as DamageType } : {}),
        ...(critical ? { critical: true } : {}),
        ...(magical ? { magical: true } : {}),
      });
    } else if (action === 'heal') run({ type: 'heal', amount: n });
    else run({ type: 'set_temp_hp', amount: n });
    close();
  };
  const press = (d: string) => setAmount((a) => (a + d).replace(/^0+/, '').slice(0, 4));
  return (
    <Dialog open={action !== null} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{action ? TITLES[action] : ''}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
        >
          <input
            inputMode="numeric"
            aria-label={S.amount}
            data-testid="hp-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').slice(0, 4))}
            className="h-14 rounded-md border bg-background text-center text-3xl font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            autoFocus
          />
          <div className="grid grid-cols-3 gap-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
              <Button key={d} type="button" variant="outline" size="lg" onClick={() => press(d)}>
                {d}
              </Button>
            ))}
            <Button type="button" variant="ghost" size="lg" onClick={() => setAmount('')} aria-label={ru.common.reset}>
              C
            </Button>
            <Button type="button" variant="outline" size="lg" onClick={() => press('0')}>
              0
            </Button>
            <Button type="button" variant="ghost" size="lg" aria-label={ru.common.delete} onClick={() => setAmount((a) => a.slice(0, -1))}>
              <DeleteIcon />
            </Button>
          </div>
          {action === 'damage' && (
            <div className="grid gap-2">
              <Select value={type} onValueChange={setType}>
                <SelectTrigger aria-label={S.damageType}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>{S.damageTypeAny}</SelectItem>
                  {DAMAGE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {DAMAGE_TYPE_LABEL_RU[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Label className="font-normal">
                <Checkbox checked={critical} onCheckedChange={(v) => setCritical(v === true)} />
                {S.critical}
              </Label>
              {['bludgeoning', 'piercing', 'slashing'].includes(type) && (
                <Label className="font-normal">
                  <Checkbox checked={magical} onCheckedChange={(v) => setMagical(v === true)} />
                  {S.magical}
                </Label>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="submit" size="lg" className="w-full" disabled={n <= 0} data-testid="hp-apply">
              {S.apply}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
