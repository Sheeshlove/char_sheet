'use client';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ABILITIES, SKILLS, type CharacterBuild, type Effect } from '@ps/content-schema';
import { ABILITY_LABEL_RU, compute, SKILL_LABEL_RU, type ComputedSheet } from '@ps/rules-engine';
import { useTRPC } from '@/lib/trpc/client';
import { useContent } from '@/lib/content/use-content';
import { ru } from '@/i18n/ru';
import { signed } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const H = ru.homebrew;
const S = ru.sheet;

/** Все эффекты сущности: умения, эффекты предмета/состояния, эффекты заклинания на заклинателя. */
export function entityEffects(data: unknown): Effect[] {
  const d = (data ?? {}) as { features?: { effects?: Effect[] }[]; feature?: { effects?: Effect[] }; effects?: Effect[]; selfEffects?: Effect[] };
  return [
    ...(Array.isArray(d.features) ? d.features.flatMap((f) => f.effects ?? []) : []),
    ...(d.feature?.effects ?? []),
    ...(Array.isArray(d.effects) ? d.effects : []),
    ...(Array.isArray(d.selfEffects) ? d.selfEffects : []),
  ];
}

type Metric = { label: string; value: (s: ComputedSheet) => string };

const METRICS: Metric[] = [
  { label: S.ac, value: (s) => String(s.ac.value) },
  { label: S.initiative, value: (s) => signed(s.initiative.value) },
  { label: S.hp, value: (s) => String(s.hp.max.value) },
  { label: S.speed, value: (s) => String(s.speed.walk?.value ?? 0) },
  { label: S.passives.perception, value: (s) => String(s.passives.perception.value) },
  { label: S.passives.insight, value: (s) => String(s.passives.insight.value) },
  { label: S.passives.investigation, value: (s) => String(s.passives.investigation.value) },
  ...ABILITIES.map((a) => ({ label: ABILITY_LABEL_RU[a], value: (s: ComputedSheet) => String(s.abilities[a].score.value) })),
  ...ABILITIES.map((a) => ({ label: `${S.saves}: ${ABILITY_LABEL_RU[a]}`, value: (s: ComputedSheet) => signed(s.abilities[a].save.value) })),
  ...SKILLS.map((k) => ({ label: SKILL_LABEL_RU[k], value: (s: ComputedSheet) => signed(s.skills[k].value.value) })),
  { label: S.spellDc, value: (s) => s.spellcasting.classes.map((c) => c.dc.value).join(' / ') || '—' },
  { label: S.attacks, value: (s) => String(s.attacks.length) },
  { label: S.resources, value: (s) => s.resources.map((r) => `${r.nameRu} ${r.max}`).join(', ') || '—' },
];

/**
 * Предпросмотр (SPEC §14): эффекты сущности добавляются к выбранному персонажу как ручной
 * эффект, лист пересчитывается движком и показываются изменившиеся числа «было → стало».
 */
export function EntityPreview({ nameRu, data }: { nameRu: string; data: unknown }) {
  const trpc = useTRPC();
  const mine = useQuery(trpc.characters.listMine.queryOptions());
  const ready = (mine.data ?? []).filter((c) => c.status === 'ready');
  const [picked, setPicked] = useState<string | null>(null);
  const characterId = picked ?? ready[0]?.id ?? null;
  const character = useQuery({ ...trpc.characters.get.queryOptions({ characterId: characterId ?? '' }), enabled: !!characterId });
  const full = character.data?.access === 'full' ? character.data : null;
  const content = useContent(full?.campaign?.id ?? null, !!full);
  const effects = useMemo(() => entityEffects(data), [data]);

  const rows = useMemo(() => {
    if (!full || !content.data || !effects.length) return null;
    const withEntity: CharacterBuild = {
      ...full.build,
      manualEffects: [...full.build.manualEffects, { id: 'homebrew-preview', labelRu: nameRu || H.preview, enabled: true, effects }],
    };
    try {
      const before = compute(full.build, full.state, content.data.index, full.rules);
      const after = compute(withEntity, full.state, content.data.index, full.rules);
      return METRICS.map((m) => ({ label: m.label, before: m.value(before), after: m.value(after) })).filter((r) => r.before !== r.after);
    } catch {
      return [];
    }
  }, [full, content.data, effects, nameRu]);

  return (
    <section className="grid gap-2 rounded-lg border p-3" data-testid="homebrew-preview">
      <h3 className="text-sm font-semibold">{H.previewTitle}</h3>
      {ready.length > 0 && (
        <Select value={characterId ?? undefined} onValueChange={setPicked}>
          <SelectTrigger size="sm" aria-label={H.previewCharacter}>
            <SelectValue placeholder={H.previewPick} />
          </SelectTrigger>
          <SelectContent>
            {ready.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {!effects.length ? (
        <p className="text-xs text-muted-foreground">{H.previewNoEffects}</p>
      ) : rows === null ? (
        <p className="text-xs text-muted-foreground">{ready.length ? ru.common.loading : H.previewPick}</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{H.previewNone}</p>
      ) : (
        <table className="text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="text-left font-normal" />
              <th className="px-2 text-right font-normal">{H.before}</th>
              <th className="px-2 text-right font-normal">{H.after}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t">
                <td className="py-1">{r.label}</td>
                <td className="px-2 text-right text-muted-foreground tabular-nums">{r.before}</td>
                <td className="px-2 text-right font-semibold tabular-nums">{r.after}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** Краткое описание эффекта для списка на одобрение. */
export function effectSummary(e: Effect): string {
  const { type, ...rest } = e as Effect & Record<string, unknown>;
  const parts = Object.entries(rest)
    .filter(([k, v]) => k !== 'id' && k !== 'when' && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'))
    .map(([k, v]) => `${H.fields[k] ?? k}: ${H.statTargets[String(v)] ?? H.enums[String(v)] ?? String(v)}`);
  return `${H.effectTypes[type] ?? type}${parts.length ? ` — ${parts.join(', ')}` : ''}`;
}
