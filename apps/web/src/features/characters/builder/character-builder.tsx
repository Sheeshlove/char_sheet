'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, CircleAlertIcon, LoaderIcon } from 'lucide-react';
import type { CharacterBuild } from '@ps/content-schema';
import { applyChoice, compute, pruneChoices, validateBuild } from '@ps/rules-engine';
import { ru } from '@/i18n/ru';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { QueryState } from '@/components/query-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCharacter, useSaveBuild } from '../use-character';
import { STEPS, stepOfChoice, stepOfIssue, type Step, type StepProps } from './types';
import { RaceStep } from './step-race';
import { ClassStep } from './step-class';
import { AbilitiesStep } from './step-abilities';
import { BackgroundStep } from './step-background';
import { EquipmentStep } from './step-equipment';
import { SpellsStep } from './step-spells';
import { DescriptionStep } from './step-description';
import { BuilderPreview } from './preview';

const B = ru.builder;
const AUTOSAVE_MS = 700;

const STEP_COMPONENT: Record<Step, (p: StepProps) => React.ReactNode> = {
  race: RaceStep,
  class: ClassStep,
  abilities: AbilitiesStep,
  background: BackgroundStep,
  equipment: EquipmentStep,
  spells: SpellsStep,
  description: DescriptionStep,
};

/** Конструктор персонажа (SPEC §9): шаги, живой предпросмотр, автосохранение черновика. */
export function CharacterBuilder({ characterId }: { characterId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const { query, full, content } = useCharacter(characterId);
  const { save } = useSaveBuild(characterId);
  const [build, setBuild] = useState<CharacterBuild | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<CharacterBuild | null>(null);
  const step = (STEPS as readonly string[]).includes(params.get('step') ?? '') ? (params.get('step') as Step) : 'race';

  useEffect(() => {
    if (full && !build) {
      setBuild(full.build);
      latest.current = full.build;
    }
  }, [full, build]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const b = latest.current;
    if (!b) return true;
    setSaving(true);
    const ok = await save(b);
    setSaving(false);
    if (ok && latest.current === b) setDirty(false);
    return ok;
  }, [save]);

  const index = content.data?.index;
  const rules = full?.rules;

  const update = useCallback(
    (fn: (b: CharacterBuild) => CharacterBuild) => {
      setBuild((prev) => {
        if (!prev || !index || !rules) return prev;
        const next = pruneChoices(fn(prev), index, rules);
        latest.current = next;
        return next;
      });
      setDirty(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
    },
    [index, rules, flush],
  );

  const onChoice = useCallback((key: string, selected: string[]) => update((b) => applyChoice(b, key, selected)), [update]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const sheet = useMemo(
    () => (build && index && rules && full ? compute(build, full.state, index, rules) : null),
    [build, index, rules, full],
  );
  const issues = useMemo(() => (build && index && rules ? validateBuild(build, index, rules) : []), [build, index, rules]);
  const errors = issues.filter((i) => i.severity === 'error');

  const goStep = (s: Step) => router.replace(`/characters/${characterId}/build?step=${s}`, { scroll: false });

  const finish = async () => {
    if (!build || errors.length) return;
    const ready: CharacterBuild = { ...build, status: 'ready' };
    latest.current = ready;
    setBuild(ready);
    const ok = await flush();
    if (!ok) {
      latest.current = build;
      setBuild(build);
      return;
    }
    toast.success(B.finished);
    const target = rules?.startingLevel ?? 1;
    router.push(target > build.levels.length ? `/characters/${characterId}/level-up` : `/characters/${characterId}`);
  };

  if (query.data && query.data.access !== 'full') {
    return <p className="text-muted-foreground">{ru.characters.summaryOnly}</p>;
  }
  if (full && !full.canEdit) return <p className="text-muted-foreground">{ru.characters.notEditable}</p>;

  const Current = STEP_COMPONENT[step];
  const stepIdx = STEPS.indexOf(step);
  const pending = sheet?.pendingChoices ?? [];

  return (
    <QueryState isLoading={query.isLoading || content.isLoading || !build} error={query.error ?? content.error}>
      {build && sheet && content.data && rules && (
        <>
          <PageHeader
            title={build.identity.name || B.title}
            description={[sheet.identity.raceLabelRu, sheet.identity.classLabelRu].filter(Boolean).join(' · ') || undefined}
            actions={
              <>
                <span className="flex items-center gap-1 text-xs text-muted-foreground" aria-live="polite">
                  {saving ? <LoaderIcon className="size-3 animate-spin" /> : !dirty ? <CheckIcon className="size-3" /> : null}
                  {saving ? B.saving : !dirty ? B.autosaved : ''}
                </span>
                {build.status === 'ready' ? (
                  <Button asChild variant="outline">
                    <Link href={`/characters/${characterId}`}>{ru.common.close}</Link>
                  </Button>
                ) : (
                  <Button onClick={() => void finish()} disabled={errors.length > 0 || saving} title={errors.length ? B.finishHint : undefined}>
                    <CheckIcon />
                    {B.finish}
                  </Button>
                )}
              </>
            }
          />
          <nav aria-label={B.title} className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1">
            {STEPS.map((s, i) => {
              const stepErrors = issues.some((x) => stepOfIssue(x, build) === s && x.severity === 'error');
              return (
                <Button
                  key={s}
                  size="sm"
                  variant={s === step ? 'default' : 'ghost'}
                  aria-current={s === step ? 'step' : undefined}
                  onClick={() => goStep(s)}
                  className="shrink-0"
                >
                  <span className="text-xs opacity-70">{i + 1}.</span>
                  {B.steps[s]}
                  {stepErrors && <CircleAlertIcon className="text-warning" aria-label={B.issues} />}
                </Button>
              );
            })}
          </nav>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="grid content-start gap-4">
              <Current
                characterId={characterId}
                build={build}
                update={update}
                onChoice={onChoice}
                content={content.data}
                rules={rules}
                sheet={sheet}
              />
              <div className="flex justify-between gap-2">
                <Button variant="outline" disabled={stepIdx === 0} onClick={() => goStep(STEPS[stepIdx - 1]!)}>
                  <ChevronLeftIcon />
                  {B.prev}
                </Button>
                {stepIdx < STEPS.length - 1 && (
                  <Button variant="outline" onClick={() => goStep(STEPS[stepIdx + 1]!)}>
                    {B.next}
                    <ChevronRightIcon />
                  </Button>
                )}
              </div>
            </div>
            <aside className="grid content-start gap-4">
              <BuilderPreview sheet={sheet} />
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    {B.pending}
                    <Badge variant={pending.length ? 'warning' : 'success'}>{pending.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-1 text-sm">
                  {pending.length === 0 && <p className="text-muted-foreground">{B.noPending}</p>}
                  {pending.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      className="rounded px-1 py-0.5 text-left hover:bg-accent"
                      onClick={() => goStep(stepOfChoice(c, build))}
                    >
                      {c.labelRu}{' '}
                      <span className="text-muted-foreground">
                        ({c.selected.length}/{c.choose})
                      </span>
                    </button>
                  ))}
                </CardContent>
              </Card>
              {issues.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{B.issues}</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-1 text-sm" data-testid="builder-issues">
                    {issues
                      .filter((i) => i.code !== 'pending_choice')
                      .map((i, n) => (
                        <button
                          key={`${i.code}-${n}`}
                          type="button"
                          onClick={() => goStep(stepOfIssue(i, build))}
                          className={cn('rounded px-1 py-0.5 text-left hover:bg-accent', i.severity === 'error' ? 'text-destructive' : 'text-warning')}
                        >
                          {i.messageRu}
                        </button>
                      ))}
                  </CardContent>
                </Card>
              )}
            </aside>
          </div>
        </>
      )}
    </QueryState>
  );
}
