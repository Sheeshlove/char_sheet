'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ABILITIES } from '@ps/content-schema';
import { ABILITY_SHORT_RU, CONDITION_LABEL_RU, type SheetSummary } from '@ps/rules-engine';
import { ArrowDownIcon, ArrowUpIcon, Columns3Icon, SparklesIcon } from 'lucide-react';
import { ru } from '@/i18n/ru';
import { cn, signed } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { HpBar } from '@/features/characters/character-card';

const G = ru.gm;
export const GM_COLUMNS = ['player', 'classLevel', 'hp', 'ac', 'passives', 'speed', 'saves', 'spellDc', 'slots', 'conditions', 'exhaustion', 'concentration', 'inspiration', 'xp'] as const;
type Column = (typeof GM_COLUMNS)[number];
const STORAGE_KEY = 'ps.gm.columns';
const DEFAULT_HIDDEN: Column[] = ['saves', 'speed'];

export type PartyRow = { id: string; name: string; ownerName: string; summary: SheetSummary | null };

type SortKey = 'name' | 'player' | 'classLevel' | 'hp' | 'ac' | 'xp' | 'speed' | 'exhaustion';

function sortValue(r: PartyRow, k: SortKey): string | number {
  const s = r.summary;
  switch (k) {
    case 'name':
      return r.name.toLowerCase();
    case 'player':
      return r.ownerName.toLowerCase();
    case 'classLevel':
      return s?.level ?? 0;
    case 'hp':
      return s ? s.hp.current / Math.max(1, s.hp.max) : 0;
    case 'ac':
      return s?.ac ?? 0;
    case 'xp':
      return s?.xp.current ?? 0;
    case 'speed':
      return s?.speedWalk ?? 0;
    case 'exhaustion':
      return s?.exhaustion ?? 0;
  }
}

function useColumns() {
  const [hidden, setHidden] = useState<Column[]>(DEFAULT_HIDDEN);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setHidden((JSON.parse(raw) as Column[]).filter((c) => (GM_COLUMNS as readonly string[]).includes(c)));
    } catch {
      // Нет доступа к хранилищу — колонки по умолчанию.
    }
  }, []);
  const toggle = (c: Column) =>
    setHidden((h) => {
      const next = h.includes(c) ? h.filter((x) => x !== c) : [...h, c];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Не сохранилось — не страшно.
      }
      return next;
    });
  return { visible: GM_COLUMNS.filter((c) => !hidden.includes(c)), hidden, toggle };
}

/** Таблица персонажей кампании (SPEC §13): сортировка, выбор колонок, выбор строк для массовых действий. */
export function PartyTable({ rows, selected, onSelect }: { rows: PartyRow[]; selected: string[]; onSelect: (ids: string[]) => void }) {
  const router = useRouter();
  const { visible, hidden, toggle } = useColumns();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 });
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const va = sortValue(a, sort.key);
        const vb = sortValue(b, sort.key);
        return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
      }),
    [rows, sort],
  );
  const header = (label: string, key?: SortKey) => (
    <th className="px-2 py-2 text-left font-medium whitespace-nowrap">
      {key ? (
        <button
          type="button"
          className="inline-flex items-center gap-1 hover:text-foreground"
          onClick={() => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }))}
          aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}
        >
          {label}
          {sort.key === key && (sort.dir === 1 ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" />)}
        </button>
      ) : (
        label
      )}
    </th>
  );
  const show = (c: Column) => visible.includes(c);
  const allSelected = rows.length > 0 && selected.length === rows.length;

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={allSelected} onCheckedChange={(v) => onSelect(v ? rows.map((r) => r.id) : [])} aria-label={G.selectAll} />
          {selected.length ? G.selected(selected.length) : G.selectAll}
        </label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <Columns3Icon />
              {G.columns}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="grid w-56 gap-1.5">
            {GM_COLUMNS.map((c) => (
              <label key={c} className="flex items-center gap-2 text-sm">
                <Checkbox checked={!hidden.includes(c)} onCheckedChange={() => toggle(c)} />
                {G.colLabels[c]}
              </label>
            ))}
          </PopoverContent>
        </Popover>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm" data-testid="party-table">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="w-8 px-2" />
              {header(ru.characters.nameLabel, 'name')}
              {show('player') && header(G.player, 'player')}
              {show('classLevel') && header(G.classLevel, 'classLevel')}
              {show('hp') && header(G.hp, 'hp')}
              {show('ac') && header(G.ac, 'ac')}
              {show('passives') && header(G.passives)}
              {show('speed') && header(G.speed, 'speed')}
              {show('saves') && header(G.saves)}
              {show('spellDc') && header(G.spellDc)}
              {show('slots') && header(G.slots)}
              {show('conditions') && header(G.conditions)}
              {show('exhaustion') && header(G.exhaustion, 'exhaustion')}
              {show('concentration') && header(G.concentration)}
              {show('inspiration') && header(G.inspiration)}
              {show('xp') && header(G.xp, 'xp')}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const s = r.summary;
              const checked = selected.includes(r.id);
              return (
                <tr
                  key={r.id}
                  className={cn('cursor-pointer border-t hover:bg-accent/50', checked && 'bg-accent/40', s?.dead && 'opacity-60')}
                  onClick={() => router.push(`/characters/${r.id}`)}
                  data-testid="party-row"
                >
                  <td className="px-2" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={checked}
                      aria-label={`${ru.common.select}: ${r.name}`}
                      onCheckedChange={(v) => onSelect(v ? [...selected, r.id] : selected.filter((x) => x !== r.id))}
                    />
                  </td>
                  <td className="px-2 py-2 font-medium whitespace-nowrap">{r.name}</td>
                  {show('player') && <td className="px-2 whitespace-nowrap text-muted-foreground">{r.ownerName}</td>}
                  {show('classLevel') && (
                    <td className="px-2 whitespace-nowrap">
                      {s ? `${s.classLabelRu} · ${s.level}` : '—'}
                    </td>
                  )}
                  {show('hp') && (
                    <td className="min-w-32 px-2">
                      {s && (
                        <div className="grid gap-1">
                          <span className="tabular-nums" data-testid="party-hp">
                            {s.hp.current}/{s.hp.max}
                            {s.hp.temp ? ` +${s.hp.temp}` : ''}
                          </span>
                          <HpBar current={s.hp.current} max={s.hp.max} temp={s.hp.temp} />
                        </div>
                      )}
                    </td>
                  )}
                  {show('ac') && <td className="px-2 tabular-nums">{s?.ac ?? '—'}</td>}
                  {show('passives') && (
                    <td className="px-2 whitespace-nowrap tabular-nums">{s ? `${s.passives.perception} / ${s.passives.insight} / ${s.passives.investigation}` : '—'}</td>
                  )}
                  {show('speed') && <td className="px-2 tabular-nums">{s?.speedWalk ?? '—'}</td>}
                  {show('saves') && (
                    <td className="px-2 text-xs whitespace-nowrap tabular-nums">
                      {s ? ABILITIES.map((a) => `${ABILITY_SHORT_RU[a]} ${signed(s.saves[a])}`).join(' ') : '—'}
                    </td>
                  )}
                  {show('spellDc') && <td className="px-2 tabular-nums">{s?.spellDcs.map((d) => d.dc).join(' / ') || '—'}</td>}
                  {show('slots') && (
                    <td className="px-2 text-xs whitespace-nowrap tabular-nums">
                      {s
                        ? [...s.slots.filter((x) => x.max > 0).map((x) => `${x.level}: ${x.max - x.used}/${x.max}`), ...(s.pact ? [`П${s.pact.level}: ${s.pact.max - s.pact.used}/${s.pact.max}`] : [])].join(' · ') || '—'
                        : '—'}
                    </td>
                  )}
                  {show('conditions') && (
                    <td className="px-2">
                      <div className="flex flex-wrap gap-1">
                        {s?.conditions.map((c) => (
                          <Badge key={c} variant="outline" className="text-[11px]">
                            {CONDITION_LABEL_RU[c]}
                          </Badge>
                        ))}
                      </div>
                    </td>
                  )}
                  {show('exhaustion') && <td className="px-2 tabular-nums">{s?.exhaustion || '—'}</td>}
                  {show('concentration') && <td className="px-2 text-xs">{s?.concentration ?? '—'}</td>}
                  {show('inspiration') && (
                    <td className="px-2">{s?.inspiration ? <SparklesIcon className="size-4 text-primary" aria-label={G.inspiration} /> : '—'}</td>
                  )}
                  {show('xp') && (
                    <td className="px-2 whitespace-nowrap tabular-nums" data-testid="party-xp">
                      {s ? `${s.xp.current}${s.xp.nextLevelAt ? ` / ${s.xp.nextLevelAt}` : ''}` : '—'}
                      {s?.xp.canLevelUp && <Badge className="ml-1 text-[10px]">↑</Badge>}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
