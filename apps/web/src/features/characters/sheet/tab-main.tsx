'use client';
import { ABILITIES, SKILLS } from '@ps/content-schema';
import {
  ABILITY_LABEL_RU,
  ABILITY_SHORT_RU,
  CONDITION_LABEL_RU,
  DAMAGE_TYPE_LABEL_RU,
  SIZE_LABEL_RU,
  SKILL_LABEL_RU,
  type RollModeInfo,
} from '@ps/rules-engine';
import { ru } from '@/i18n/ru';
import { formatFeet } from '@/lib/format';
import { cn, signed } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ProfDot, Section } from './bits';
import { useSheet } from './context';
import { ValButton } from './val';

const S = ru.sheet;

export function ModeBadges({ modes }: { modes: RollModeInfo[] }) {
  if (!modes.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {modes.map((m, i) => (
        <Badge key={i} variant={m.mode === 'advantage' ? 'success' : 'destructive'} title={`${m.noteRu} (${m.sourceLabelRu})`} className="text-[10px]">
          {m.mode === 'advantage' ? S.advShort : S.disShort}
          {m.conditional ? '*' : ''}
        </Badge>
      ))}
    </span>
  );
}

export function AbilitiesGrid() {
  const { sheet } = useSheet();
  return (
    <Section title={S.abilities}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
        {ABILITIES.map((a) => {
          const ab = sheet.abilities[a];
          return (
            <div key={a} className="grid gap-1 rounded-lg border p-2 text-center" data-testid={`ability-${a}`}>
              <span className="text-xs text-muted-foreground">{ABILITY_LABEL_RU[a]}</span>
              <span className="text-2xl font-semibold tabular-nums">{signed(ab.mod)}</span>
              <ValButton val={ab.score} path={`abilities.${a}.score`} label={ABILITY_LABEL_RU[a]} className="mx-auto text-sm" />
              <div className="flex flex-wrap items-center justify-center gap-1 border-t pt-1 text-xs">
                <ProfDot level={ab.saveProficient ? 'proficient' : 'none'} />
                <span className="text-muted-foreground">{S.saveShort}</span>
                <ValButton val={ab.save} path={`abilities.${a}.save`} label={`${S.saves}: ${ABILITY_LABEL_RU[a]}`} sign testId={`save-${a}`} />
                {ab.autoFail && <Badge variant="destructive">{S.autoFail}</Badge>}
                <ModeBadges modes={ab.modes} />
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

export function SkillsList() {
  const { sheet } = useSheet();
  return (
    <Section title={S.skills}>
      <ul className="grid gap-0.5">
        {SKILLS.map((k) => {
          const sk = sheet.skills[k];
          return (
            <li key={k} className="flex items-center gap-2 text-sm" data-testid={`skill-${k}`}>
              <ProfDot level={sk.prof} />
              <span className="flex-1">
                {SKILL_LABEL_RU[k]} <span className="text-xs text-muted-foreground">({ABILITY_SHORT_RU[sk.ability]})</span>
              </span>
              <ModeBadges modes={sk.modes} />
              <ValButton val={sk.value} path={`skills.${k}`} label={SKILL_LABEL_RU[k]} sign className="w-10" />
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

export function TabMain() {
  const { sheet } = useSheet();
  const d = sheet.defenses;
  const defenseLine = (label: string, lines: typeof d.resistances) =>
    lines.length > 0 && (
      <p>
        <span className="text-muted-foreground">{label}: </span>
        {lines.map((l) => `${DAMAGE_TYPE_LABEL_RU[l.damageType]}${l.noteRu ? ` (${l.noteRu})` : ''}`).join(', ')}
      </p>
    );
  const profLine = (label: string, list: string[]) => (
    <p>
      <span className="text-muted-foreground">{label}: </span>
      {list.length ? list.join(', ') : ru.common.none}
    </p>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="grid content-start gap-4">
        <AbilitiesGrid />
      </div>
      <div className="grid content-start gap-4">
        <SkillsList />
      </div>
      <div className="grid content-start gap-4">
        <Section title={S.passive}>
          <ul className="grid gap-1 text-sm">
            {(['perception', 'insight', 'investigation'] as const).map((k) => (
              <li key={k} className="flex justify-between" data-testid={`passive-${k}`}>
                <span>{S.passives[k]}</span>
                <ValButton val={sheet.passives[k]} path={`passives.${k}`} label={S.passives[k]} />
              </li>
            ))}
          </ul>
        </Section>
        <Section title={S.proficiencies}>
          <div className="grid gap-1 text-sm">
            {profLine(S.armor, sheet.proficiencies.armor)}
            {profLine(S.weapons, sheet.proficiencies.weapons)}
            {profLine(S.tools, sheet.proficiencies.tools)}
            {profLine(S.languages, sheet.proficiencies.languages)}
          </div>
        </Section>
        <Section title={`${S.speed} · ${S.senses}`}>
          <div className="grid gap-1 text-sm">
            <p>
              {Object.entries(sheet.speed)
                .map(([mode, v]) => `${S.speedModes[mode] ?? mode} ${formatFeet(v!.value)}`)
                .join(', ')}
            </p>
            <p>
              <span className="text-muted-foreground">{S.size}: </span>
              {SIZE_LABEL_RU[sheet.size]}
            </p>
            {sheet.senses.map((s) => (
              <p key={s.sense}>
                {S.senseNames[s.sense] ?? s.sense}: {formatFeet(s.rangeFt)}
              </p>
            ))}
          </div>
        </Section>
        {(d.resistances.length || d.immunities.length || d.vulnerabilities.length || d.conditionImmunities.length) > 0 && (
          <Section title={S.defenses}>
            <div className="grid gap-1 text-sm">
              {defenseLine(S.resistances, d.resistances)}
              {defenseLine(S.immunities, d.immunities)}
              {defenseLine(S.vulnerabilities, d.vulnerabilities)}
              {d.conditionImmunities.length > 0 && (
                <p>
                  <span className="text-muted-foreground">{S.conditionImmunities}: </span>
                  {d.conditionImmunities.map((c) => CONDITION_LABEL_RU[c]).join(', ')}
                </p>
              )}
            </div>
          </Section>
        )}
        {sheet.rollModes.length > 0 && (
          <Section title={S.rollModes}>
            <ul className="grid gap-1 text-sm">
              {sheet.rollModes.map((m, i) => (
                <li key={i} className={cn(m.mode === 'advantage' ? 'text-success' : 'text-destructive')}>
                  {m.mode === 'advantage' ? S.advantage : S.disadvantage}: {m.noteRu}{' '}
                  <span className="text-muted-foreground">({m.sourceLabelRu})</span>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}
