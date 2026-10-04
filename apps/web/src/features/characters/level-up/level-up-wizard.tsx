'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowUpCircleIcon, DicesIcon } from 'lucide-react';
import type { CharacterBuild } from '@ps/content-schema';
import {
  applyChoice,
  applyLevelUp,
  compute,
  levelUpOptions,
  pruneChoices,
  type ChoiceInfo,
  type ComputedSheet,
  type LevelUpDecision,
} from '@ps/rules-engine';
import { useTRPC } from '@/lib/trpc/client';
import { secureRandom } from '@/lib/random';
import { ru } from '@/i18n/ru';
import { cn, signed } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { QueryState } from '@/components/query-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChoiceEditor } from '../choice-editor';
import { FeatureList } from '../builder/shared';
import { useCharacter } from '../use-character';

const L = ru.levelUp;

function sameArr(a: string[] | undefined, b: string[] | undefined) {
  return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
}

/** Мастер повышения уровня (SPEC §10). */
export function LevelUpWizard({ characterId }: { characterId: string }) {
  const { query, full, content, sheet } = useCharacter(characterId);
  return (
    <QueryState isLoading={query.isLoading || content.isLoading} error={query.error ?? content.error}>
      {full && content.data && sheet && (
        <Wizard key={full.version} characterId={characterId} full={full} index={content.data.index} before={sheet} />
      )}
    </QueryState>
  );
}

type WizardProps = {
  characterId: string;
  full: NonNullable<ReturnType<typeof useCharacter>['full']>;
  index: NonNullable<ReturnType<typeof useCharacter>['content']['data']>['index'];
  before: ComputedSheet;
};

function Wizard({ characterId, full, index, before }: WizardProps) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const router = useRouter();
  const { build, rules, state } = full;
  const opts = useMemo(() => levelUpOptions(build, index, rules, state), [build, index, rules, state]);
  const available = opts.classes.filter((c) => c.available);
  const [classKey, setClassKey] = useState(available.find((c) => !c.isNew)?.classKey ?? available[0]?.classKey ?? '');
  const [hpMethod, setHpMethod] = useState<'average' | 'roll'>(opts.hpMethods[0] ?? 'average');
  const [hpRoll, setHpRoll] = useState('');
  const [picks, setPicks] = useState<Record<string, string[]>>({});
  const [replace, setReplace] = useState<{ from: string; to: string }>({ from: '', to: '' });
  const opt = opts.classes.find((c) => c.classKey === classKey);

  const hp: LevelUpDecision['hp'] =
    hpMethod === 'roll' ? { method: 'roll', ...(Number(hpRoll) >= 1 ? { roll: Number(hpRoll) } : {}) } : { method: 'average' };

  const draft: CharacterBuild | null = useMemo(() => {
    if (!opt) return null;
    try {
      let b = applyLevelUp(build, { classKey, hp: hpMethod === 'roll' ? { method: 'roll', roll: Number(hpRoll) || 1 } : { method: 'average' } }, index, rules);
      for (const [k, v] of Object.entries(picks)) b = applyChoice(b, k, v);
      if (replace.from && replace.to) {
        b = {
          ...b,
          knownSpells: b.knownSpells.map((ks) =>
            ks.classKey === classKey ? { ...ks, spells: ks.spells.map((s) => (s === replace.from ? replace.to : s)) } : ks,
          ),
        };
      }
      return pruneChoices(b, index, rules);
    } catch {
      return null;
    }
  }, [opt, build, classKey, hpMethod, hpRoll, picks, replace, index, rules]);

  const after = useMemo(() => (draft ? compute(draft, state, index, rules) : null), [draft, state, index, rules]);

  const oldChoice = new Map(before.choices.map((c) => [c.key, c]));
  const levelChoices: ChoiceInfo[] = (after?.choices ?? []).filter((c) => {
    if (c.kind === 'hp') return false;
    const old = oldChoice.get(c.key);
    if (!old) return true;
    return old.choose !== c.choose || picks[c.key] !== undefined;
  });

  const levelUp = useMutation(
    trpc.characters.levelUp.mutationOptions({
      onSuccess: async () => {
        toast.success(L.applied(build.levels.length + 1));
        await qc.invalidateQueries({ queryKey: trpc.characters.get.queryKey({ characterId }) });
        const remaining = rules.startingLevel - (build.levels.length + 1);
        if (remaining <= 0) router.push(`/characters/${characterId}`);
      },
    }),
  );

  const submit = () => {
    if (!draft) return;
    const oldKs = build.knownSpells.find((k) => k.classKey === classKey);
    const newKs = draft.knownSpells.find((k) => k.classKey === classKey);
    const diff = (a: string[] | undefined, b: string[] | undefined) => (b ?? []).filter((x) => !(a ?? []).includes(x));
    const entry = draft.classes.find((c) => c.classKey === classKey);
    const oldEntry = build.classes.find((c) => c.classKey === classKey);
    const decision: LevelUpDecision = {
      classKey,
      hp,
      ...(entry?.subclassKey && entry.subclassKey !== oldEntry?.subclassKey ? { subclassKey: entry.subclassKey } : {}),
      ...(draft.levels.at(-1)?.asi ? { asi: draft.levels.at(-1)!.asi } : {}),
      choices: Object.fromEntries(Object.entries(draft.choices).filter(([k, v]) => !sameArr(build.choices[k], v))),
      spells: {
        cantrips: diff(oldKs?.cantrips, newKs?.cantrips),
        spells: diff(oldKs?.spells, newKs?.spells).filter((s) => s !== replace.to || !replace.from),
        spellbook: diff(oldKs?.spellbook, newKs?.spellbook),
        ...(replace.from && replace.to ? { replace } : {}),
      },
    };
    levelUp.mutate({ characterId, decision, expectedVersion: full.version });
  };

  if (!opts.canLevelUp || !full.canEdit) {
    return (
      <>
        <PageHeader title={L.title} />
        <p className="text-muted-foreground">{opts.reasonRu ?? L.cannot}</p>
        <Button asChild variant="outline" className="mt-3">
          <Link href={`/characters/${characterId}`}>{ru.common.back}</Link>
        </Button>
      </>
    );
  }

  const cls = index.getOf(classKey, 'class');
  const newClassLevel = (before.level.byClass[classKey] ?? 0) + 1;
  const sub = draft?.classes.find((c) => c.classKey === classKey)?.subclassKey;
  const subEnt = sub ? index.getOf(sub, 'subclass') : undefined;
  const newFeatures = [
    ...(cls?.data.features.filter((f) => f.level === newClassLevel) ?? []),
    ...(subEnt?.data.features.filter((f) => f.level === newClassLevel) ?? []),
  ];
  const pendingAfter = after?.pendingChoices.filter((c) => c.kind !== 'hp').length ?? 0;
  const hpReady = hpMethod === 'average' || (Number(hpRoll) >= 1 && Number(hpRoll) <= (opt?.hitDie ?? 12));
  const knownChoice = after?.choices.find((c) => c.key === `spells:${classKey}:known`);
  const oldKnown = build.knownSpells.find((k) => k.classKey === classKey)?.spells ?? [];

  const rows: [string, string | number, string | number][] = after
    ? [
        [L.maxHp, before.hp.max.value, after.hp.max.value],
        [ru.sheet.ac, before.ac.value, after.ac.value],
        [ru.sheet.pb, signed(before.pb.value), signed(after.pb.value)],
        [L.attacks, before.attacksPerAction, after.attacksPerAction],
        ...after.spellcasting.slots
          .filter((s) => s.max > 0 || (before.spellcasting.slots[s.level - 1]?.max ?? 0) > 0)
          .map((s) => [ru.sheet.spellLevel(s.level), before.spellcasting.slots[s.level - 1]?.max ?? 0, s.max] as [string, number, number]),
      ]
    : [];

  return (
    <>
      <PageHeader
        title={`${L.title}: ${before.identity.name}`}
        description={L.toLevel(opts.nextLevel)}
        actions={
          <Button asChild variant="outline">
            <Link href={`/characters/${characterId}`}>{ru.common.cancel}</Link>
          </Button>
        }
      />
      {rules.startingLevel > opts.nextLevel && <p className="mb-3 text-sm text-muted-foreground">{L.remainingLevels(rules.startingLevel - build.levels.length)}</p>}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">1. {L.classStep}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              {opts.classes.map((c) => (
                <button
                  key={c.classKey}
                  type="button"
                  disabled={!c.available}
                  aria-pressed={c.classKey === classKey}
                  onClick={() => {
                    setClassKey(c.classKey);
                    setPicks({});
                    setReplace({ from: '', to: '' });
                  }}
                  className={cn(
                    'grid gap-0.5 rounded-lg border p-3 text-left disabled:cursor-not-allowed disabled:opacity-50',
                    c.classKey === classKey && 'border-primary bg-primary/10',
                  )}
                >
                  <span className="font-medium">
                    {c.nameRu} {c.newLevel}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {c.isNew ? L.newClass : L.continueClass}
                    {!c.available && c.reasonRu ? ` · ${c.reasonRu}` : ''}
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">2. {L.hpStep}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-2">
              {opts.hpMethods.includes('average') && (
                <Button variant={hpMethod === 'average' ? 'default' : 'outline'} onClick={() => setHpMethod('average')}>
                  {L.hpAverage(opt?.hpAverage ?? 0)}
                </Button>
              )}
              {opts.hpMethods.includes('roll') && (
                <>
                  <Button variant={hpMethod === 'roll' ? 'default' : 'outline'} onClick={() => setHpMethod('roll')}>
                    {L.hpRoll}
                  </Button>
                  {hpMethod === 'roll' && (
                    <>
                      <Input
                        type="number"
                        min={1}
                        max={opt?.hitDie ?? 12}
                        className="w-20"
                        value={hpRoll}
                        onChange={(e) => setHpRoll(e.target.value)}
                        aria-label={L.hpRollValue}
                      />
                      <Button variant="ghost" onClick={() => setHpRoll(String(1 + Math.floor(secureRandom() * (opt?.hitDie ?? 8))))}>
                        <DicesIcon />
                        {L.rollHp} к{opt?.hitDie}
                      </Button>
                    </>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">3. {L.featuresStep}</CardTitle>
            </CardHeader>
            <CardContent>
              {newFeatures.length ? (
                <FeatureList features={newFeatures} statusLabels={ru.sheet.automated} />
              ) : (
                <p className="text-sm text-muted-foreground">{L.noNewFeatures}</p>
              )}
            </CardContent>
          </Card>

          {levelChoices.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">4. {L.choicesStep}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                {levelChoices.map((c) => (
                  <ChoiceEditor key={c.key} choice={c} onChange={(v) => setPicks((p) => ({ ...p, [c.key]: v }))} />
                ))}
              </CardContent>
            </Card>
          )}

          {opt?.spells?.canReplaceKnown && knownChoice && oldKnown.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">5. {L.spellsStep}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2">
                <p className="text-sm text-muted-foreground sm:col-span-2">{L.replaceKnown}</p>
                <Select value={replace.from} onValueChange={(v) => setReplace((r) => ({ ...r, from: v }))}>
                  <SelectTrigger aria-label={L.replaceFrom}>
                    <SelectValue placeholder={L.replaceFrom} />
                  </SelectTrigger>
                  <SelectContent>
                    {oldKnown.map((k) => (
                      <SelectItem key={k} value={k}>
                        {index.get(k)?.nameRu ?? k}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={replace.to} onValueChange={(v) => setReplace((r) => ({ ...r, to: v }))}>
                  <SelectTrigger aria-label={L.replaceTo}>
                    <SelectValue placeholder={L.replaceTo} />
                  </SelectTrigger>
                  <SelectContent>
                    {knownChoice.options
                      .filter((o) => !oldKnown.includes(o.value))
                      .map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.labelRu} ({o.hintRu})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          )}
        </div>

        <aside className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{L.summary}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead />
                    <TableHead>{L.before}</TableHead>
                    <TableHead>{L.after}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(([label, a, b]) => (
                    <TableRow key={label}>
                      <TableCell className="text-muted-foreground">{label}</TableCell>
                      <TableCell className="tabular-nums">{a}</TableCell>
                      <TableCell className={cn('tabular-nums', a !== b && 'font-semibold text-success')} data-testid={label === L.maxHp ? 'levelup-hp-after' : undefined}>
                        {b}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {pendingAfter > 0 && <p className="text-xs text-warning">{ru.sheet.pendingBanner(pendingAfter)}</p>}
              <Button onClick={submit} disabled={!draft || !hpReady || levelUp.isPending} data-testid="levelup-apply">
                <ArrowUpCircleIcon />
                {L.apply}
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}
