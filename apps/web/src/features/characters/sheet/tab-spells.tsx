'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { BookOpenIcon, SparklesIcon } from 'lucide-react';
import type { SpellcastingClass, SpellEntry } from '@ps/rules-engine';
import { ru } from '@/i18n/ru';
import { cn } from '@/lib/utils';
import { entityHref } from '@/features/library/library-list';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Pips, Section } from './bits';
import { useSheet } from './context';
import { ValButton } from './val';

const S = ru.sheet;

/** Трекер ячеек: обычные и договора. */
export function SlotsBlock({ big = false }: { big?: boolean }) {
  const { sheet, run, canEditState } = useSheet();
  const slots = sheet.spellcasting.slots.filter((s) => s.max > 0);
  const pact = sheet.spellcasting.pact;
  if (!slots.length && !pact) return null;
  return (
    <Section title={S.slots}>
      <div className="grid gap-2" data-testid="slots">
        {slots.map((s) => (
          <div key={s.level} className="flex items-center gap-3" data-testid={`slots-${s.level}`}>
            <span className="w-14 text-sm text-muted-foreground">{S.spellLevel(s.level)}</span>
            <Pips
              max={s.max}
              used={s.used}
              label={S.spellLevel(s.level)}
              size={big ? 'lg' : 'md'}
              disabled={!canEditState}
              onUse={() => run({ type: 'spend_slot', level: s.level })}
              onRestore={() => run({ type: 'restore_slot', level: s.level })}
            />
          </div>
        ))}
        {pact && (
          <div className="flex items-center gap-3" data-testid="slots-pact">
            <span className="w-14 text-sm text-muted-foreground">{S.pactSlots(pact.level)}</span>
            <Pips
              max={pact.max}
              used={pact.used}
              label={S.pactSlots(pact.level)}
              size={big ? 'lg' : 'md'}
              disabled={!canEditState}
              onUse={() => run({ type: 'spend_slot', level: pact.level, pact: true })}
              onRestore={() => run({ type: 'restore_slot', level: pact.level, pact: true })}
            />
          </div>
        )}
      </div>
    </Section>
  );
}

function CastDialog({ spell }: { spell: SpellEntry }) {
  const { sheet, run, canEditState } = useSheet();
  const [open, setOpen] = useState(false);
  const slots = sheet.spellcasting.slots.filter((s) => s.level >= spell.level && s.max - s.used > 0);
  const pact = sheet.spellcasting.pact;
  const pactOk = pact && pact.level >= spell.level && pact.max - pact.used > 0;
  const cast = (level: number, isPact: boolean) => {
    run({ type: 'spend_slot', level, ...(isPact ? { pact: true } : {}) });
    if (spell.concentration) run({ type: 'concentrate', spellKey: spell.key });
    setOpen(false);
  };
  if (spell.level === 0) {
    return spell.concentration ? (
      <Button size="sm" variant="ghost" disabled={!canEditState} onClick={() => run({ type: 'concentrate', spellKey: spell.key })}>
        {S.cast}
      </Button>
    ) : null;
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" disabled={!canEditState} data-testid={`cast-${spell.key}`}>
          <SparklesIcon />
          {S.cast}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{S.castTitle(spell.nameRu)}</DialogTitle>
          <DialogDescription>{S.slotLevel}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {slots.map((s) => (
            <Button key={s.level} variant="outline" onClick={() => cast(s.level, false)}>
              {S.spellLevel(s.level)} ({s.max - s.used}/{s.max})
            </Button>
          ))}
          {pactOk && (
            <Button variant="outline" onClick={() => cast(pact!.level, true)}>
              {S.pactSlots(pact!.level)} ({pact!.max - pact!.used}/{pact!.max})
            </Button>
          )}
          {!slots.length && !pactOk && <p className="text-sm text-muted-foreground">{S.noSlots}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Подготовка заклинаний для классов «prepared» (жрец, друид, паладин): весь список класса. */
function PrepareDialog({ c }: { c: SpellcastingClass }) {
  const { index, run, character, canEditState } = useSheet();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const current = character.state.prepared[c.classKey] ?? [];
  const [sel, setSel] = useState<string[]>(current);
  const pool = useMemo(() => {
    if (!index) return [];
    const always = new Set(c.spells.filter((s) => s.alwaysPrepared).map((s) => s.key));
    return index
      .spellList(c.spellListKey)
      .map((k) => index.getOf(k, 'spell'))
      .filter((s): s is NonNullable<typeof s> => !!s && s.data.level >= 1 && s.data.level <= c.maxSpellLevel && !always.has(s.key))
      .sort((a, b) => a.data.level - b.data.level || a.nameRu.localeCompare(b.nameRu, 'ru'));
  }, [index, c.spellListKey, c.maxSpellLevel, c.spells]);
  const filtered = pool.filter((s) => !q || s.nameRu.toLowerCase().includes(q.toLowerCase()));
  const max = c.preparedMax ?? 0;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setSel(current);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={!canEditState}>
          <BookOpenIcon />
          {S.prepared}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{c.nameRu}</DialogTitle>
          <DialogDescription>{S.preparedCount(sel.length, max)}</DialogDescription>
        </DialogHeader>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={ru.common.searchPlaceholder} aria-label={ru.common.search} />
        <div className="grid max-h-80 gap-1 overflow-y-auto">
          {filtered.map((s) => {
            const checked = sel.includes(s.key);
            return (
              <Label key={s.key} className="flex items-center gap-2 rounded px-2 py-1 font-normal hover:bg-accent">
                <Checkbox
                  checked={checked}
                  disabled={!checked && sel.length >= max}
                  onCheckedChange={(v) => setSel((cur) => (v ? [...cur, s.key] : cur.filter((k) => k !== s.key)))}
                />
                <span className="flex-1">{s.nameRu}</span>
                <span className="text-xs text-muted-foreground">{S.spellLevel(s.data.level)}</span>
              </Label>
            );
          })}
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              run({ type: 'set_prepared', classKey: c.classKey, spells: sel });
              setOpen(false);
            }}
          >
            {ru.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ClassSpells({ c, ritualsOnly }: { c: SpellcastingClass; ritualsOnly: boolean }) {
  const { run, character, canEditState } = useSheet();
  const prepared = character.state.prepared[c.classKey] ?? [];
  const preparedCount = c.spells.filter((s) => s.prepared && !s.alwaysPrepared && s.level > 0).length;
  const togglePrepared = (key: string, on: boolean) =>
    run({ type: 'set_prepared', classKey: c.classKey, spells: on ? [...prepared, key] : prepared.filter((k) => k !== key) });
  const list = c.spells.filter((s) => !ritualsOnly || s.ritual);
  const levels = [...new Set(list.map((s) => s.level))].sort((a, b) => a - b);
  return (
    <Section
      title={c.nameRu}
      actions={c.preparation === 'prepared' && <PrepareDialog c={c} />}
    >
      <div className="grid gap-3">
        <div className="flex flex-wrap gap-4 text-sm">
          <span>
            {S.spellDc}: <ValButton val={c.dc} label={`${c.nameRu}: ${S.spellDc}`} testId={`spell-dc-${c.classKey}`} />
          </span>
          <span>
            {S.spellAttack}: <ValButton val={c.attack} label={`${c.nameRu}: ${S.spellAttack}`} sign />
          </span>
          {c.preparedMax !== undefined && (
            <span className={cn(preparedCount > c.preparedMax && 'text-destructive')}>{S.preparedCount(preparedCount, c.preparedMax)}</span>
          )}
        </div>
        {levels.length === 0 && <p className="text-sm text-muted-foreground">{S.noSpells}</p>}
        {levels.map((lvl) => (
          <div key={lvl} className="grid gap-1">
            <p className="text-xs font-medium text-muted-foreground">{lvl === 0 ? S.cantrips : S.spellLevel(lvl)}</p>
            <ul className="grid gap-0.5">
              {list
                .filter((s) => s.level === lvl)
                .map((s) => (
                  <li key={s.key} className="flex items-center gap-2 text-sm" data-testid="spell-row">
                    {c.preparation === 'spellbook' && lvl > 0 && (
                      <Checkbox
                        aria-label={`${S.prepared}: ${s.nameRu}`}
                        checked={s.prepared}
                        disabled={!canEditState || s.alwaysPrepared}
                        onCheckedChange={(v) => togglePrepared(s.key, v === true)}
                      />
                    )}
                    <Link href={entityHref(s.key, 'spell')} className="flex-1 hover:underline" target="_blank">
                      {s.nameRu}
                    </Link>
                    {s.alwaysPrepared && <Badge variant="secondary">{S.alwaysPrepared}</Badge>}
                    {s.ritual && <Badge variant="outline">{S.ritual}</Badge>}
                    {s.concentration && <Badge variant="outline" title={S.concentration}>{S.concentrationShort}</Badge>}
                    {(s.prepared || s.level === 0) && <CastDialog spell={s} />}
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}

export function GrantsBlock() {
  const { sheet, run, canEditState } = useSheet();
  const grants = sheet.spellcasting.grants;
  if (!grants.length) return null;
  return (
    <Section title={S.grants}>
      <ul className="grid gap-2 text-sm">
        {grants.map((g) => (
          <li key={g.id} className="flex flex-wrap items-center gap-2">
            <Link href={entityHref(g.spellKey, 'spell')} target="_blank" className="flex-1 hover:underline">
              {g.nameRu}
              {g.castAtLevel ? ` (${S.spellLevel(g.castAtLevel)})` : ''}
            </Link>
            <span className="text-xs text-muted-foreground">{g.sourceLabelRu}</span>
            {g.uses && (
              <Pips
                max={g.uses.max}
                used={g.uses.used}
                label={g.nameRu}
                disabled={!canEditState}
                onUse={() => run({ type: 'use_grant', id: g.id })}
                onRestore={() => undefined}
              />
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function TabSpells() {
  const { sheet } = useSheet();
  const [ritualsOnly, setRitualsOnly] = useState(false);
  const sc = sheet.spellcasting;
  if (!sc.classes.length && !sc.grants.length) return <p className="text-muted-foreground">{S.noSpells}</p>;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="grid content-start gap-4">
        <Label className="w-fit font-normal">
          <Switch checked={ritualsOnly} onCheckedChange={setRitualsOnly} />
          {S.ritualsOnly}
        </Label>
        {sc.classes.map((c) => (
          <ClassSpells key={c.classKey} c={c} ritualsOnly={ritualsOnly} />
        ))}
        <GrantsBlock />
      </div>
      <div className="grid content-start gap-4">
        <SlotsBlock />
        {sheet.status.concentration && (
          <p className="text-sm">
            {S.concentration}: <strong>{sheet.status.concentration.nameRu}</strong>
          </p>
        )}
      </div>
    </div>
  );
}
