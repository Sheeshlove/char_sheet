'use client';
import { useState } from 'react';
import { DicesIcon, MoonIcon, TentIcon, XIcon } from 'lucide-react';
import { ru } from '@/i18n/ru';
import { secureRandom } from '@/lib/random';
import { signed } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useSheet } from './context';

const S = ru.sheet;
type Die = 6 | 8 | 10 | 12;

/** Короткий отдых: выбор костей хитов и ввод бросков (или бросок в приложении). */
export function ShortRestDialog({ size = 'default' }: { size?: 'default' | 'lg' }) {
  const { sheet, run, canEditState } = useSheet();
  const [open, setOpen] = useState(false);
  const [spent, setSpent] = useState<{ die: Die; roll: string }[]>([]);
  const con = sheet.abilities.con.mod;
  const leftOf = (die: Die) => {
    const hd = sheet.hitDice.find((h) => h.die === die);
    return hd ? hd.total - hd.used - spent.filter((s) => s.die === die).length : 0;
  };
  const valid = spent.every((s) => {
    const r = Number(s.roll);
    return Number.isInteger(r) && r >= 1 && r <= s.die;
  });
  const total = spent.reduce((sum, s) => sum + Math.max(0, (Number(s.roll) || 0) + con), 0);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSpent([]);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size={size} disabled={!canEditState} className="h-auto min-h-9 whitespace-normal py-2">
          <TentIcon />
          {S.shortRest}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{S.shortRest}</DialogTitle>
          <DialogDescription>{S.shortRestHint}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          {sheet.hitDice.map((h) => (
            <Button
              key={h.die}
              variant="outline"
              size="sm"
              disabled={leftOf(h.die) <= 0}
              onClick={() => setSpent((s) => [...s, { die: h.die, roll: '' }])}
            >
              {S.spendDie(h.die)} <span className="text-muted-foreground">({S.hitDiceLeft(leftOf(h.die), h.total)})</span>
            </Button>
          ))}
        </div>
        <ul className="grid gap-2">
          {spent.map((s, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="w-10 text-sm">к{s.die}</span>
              <Input
                type="number"
                min={1}
                max={s.die}
                className="w-20"
                aria-label={`к${s.die}`}
                value={s.roll}
                onChange={(e) => setSpent((arr) => arr.map((x, j) => (j === i ? { ...x, roll: e.target.value } : x)))}
              />
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={S.rollDie}
                onClick={() =>
                  setSpent((arr) => arr.map((x, j) => (j === i ? { ...x, roll: String(1 + Math.floor(secureRandom() * x.die)) } : x)))
                }
              >
                <DicesIcon />
              </Button>
              <span className="text-xs text-muted-foreground">{signed(con)}</span>
              <Button size="icon-sm" variant="ghost" aria-label={ru.common.remove} onClick={() => setSpent((arr) => arr.filter((_, j) => j !== i))}>
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
        {spent.length > 0 && <p className="text-sm">+{total} {S.hp.toLowerCase()}</p>}
        <DialogFooter>
          <Button
            disabled={!valid}
            onClick={() => {
              run({ type: 'short_rest', hitDice: spent.map((s) => ({ die: s.die, roll: Number(s.roll) })) });
              setOpen(false);
              setSpent([]);
            }}
          >
            {S.shortRest}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LongRestDialog({ size = 'default' }: { size?: 'default' | 'lg' }) {
  const { run, canEditState } = useSheet();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size={size} disabled={!canEditState} className="h-auto min-h-9 whitespace-normal py-2">
          <MoonIcon />
          {S.longRest}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{S.longRest}</DialogTitle>
          <DialogDescription>{S.longRestConfirm}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            onClick={() => {
              run({ type: 'long_rest' });
              setOpen(false);
            }}
          >
            {ru.common.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
