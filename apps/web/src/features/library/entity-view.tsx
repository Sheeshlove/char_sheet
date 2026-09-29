'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ExternalLinkIcon } from 'lucide-react';
import type {
  ArmorData,
  BackgroundData,
  ClassData,
  FeatData,
  Feature,
  GearData,
  LanguageData,
  MagicItemData,
  RaceData,
  SpellData,
  SubclassData,
  SubraceData,
  WeaponData,
} from '@ps/content-schema';
import {
  ABILITY_LABEL_RU,
  DAMAGE_TYPE_LABEL_RU,
  proficiencyBonus,
  SCHOOL_LABEL_RU,
  SIZE_LABEL_RU,
  SKILL_LABEL_RU,
} from '@ps/rules-engine';
import { useTRPC } from '@/lib/trpc/client';
import { ru } from '@/i18n/ru';
import { diceRu, formatCost, formatFeet, formatWeight } from '@/lib/format';
import { PageHeader } from '@/components/layout/page-header';
import { QueryState } from '@/components/query-state';
import { Markdown } from '@/components/markdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { entityHref } from './library-list';

const L = ru.library;

const PROPERTY_RU: Record<string, string> = {
  ammunition: 'боеприпасы',
  finesse: 'фехтовальное',
  heavy: 'тяжёлое',
  light: 'лёгкое',
  loading: 'перезарядка',
  range: 'дистанция',
  reach: 'досягаемость',
  special: 'особое',
  thrown: 'метательное',
  two_handed: 'двуручное',
  versatile: 'универсальное',
};

const SPELL_LIST_RU: Record<string, string> = {
  bard: 'Бард',
  cleric: 'Жрец',
  druid: 'Друид',
  paladin: 'Паладин',
  ranger: 'Следопыт',
  sorcerer: 'Чародей',
  warlock: 'Колдун',
  wizard: 'Волшебник',
  artificer: 'Изобретатель',
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-2 py-1 text-sm max-sm:grid-cols-1 max-sm:gap-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Features({ features }: { features: Feature[] }) {
  const visible = features.filter((f) => !f.hidden);
  if (!visible.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{L.features}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {visible.map((f) => (
          <section key={f.key} className="grid gap-1">
            <h3 className="flex flex-wrap items-center gap-2 font-semibold">
              {f.nameRu}
              {f.level !== undefined && <Badge variant="outline">{f.level} ур.</Badge>}
              <Badge variant={f.effectsStatus === 'complete' ? 'success' : f.effectsStatus === 'partial' ? 'warning' : 'secondary'}>
                {L.automation}: {L.automated[f.effectsStatus]}
              </Badge>
            </h3>
            {f.textMd && <Markdown className="text-muted-foreground">{f.textMd}</Markdown>}
          </section>
        ))}
      </CardContent>
    </Card>
  );
}

function Details({ kind, data }: { kind: string; data: unknown }) {
  switch (kind) {
    case 'weapon': {
      const d = data as WeaponData;
      return (
        <dl>
          <Row label={L.category}>
            {L.weaponCategories[d.category]}, {L.weaponRange[d.range]}
          </Row>
          <Row label={L.damage}>
            {d.damage.dice === '—' ? '—' : `${diceRu(d.damage.dice)} ${DAMAGE_TYPE_LABEL_RU[d.damage.type].toLowerCase()}`}
            {d.versatileDice ? ` (двумя руками ${diceRu(d.versatileDice)})` : ''}
          </Row>
          <Row label={L.properties}>{d.properties.map((p) => PROPERTY_RU[p] ?? p).join(', ') || '—'}</Row>
          {d.rangeFt && (
            <Row label={L.range}>
              {d.rangeFt.normal}/{d.rangeFt.long} {L.ft}
            </Row>
          )}
          <Row label={L.cost}>{formatCost(d.costCp)}</Row>
          <Row label={L.weight}>{formatWeight(d.weightLb)}</Row>
        </dl>
      );
    }
    case 'armor': {
      const d = data as ArmorData;
      const ac =
        d.category === 'shield'
          ? `+${d.baseAc}`
          : d.dexCap === null
            ? `${d.baseAc} + модификатор Ловкости`
            : d.dexCap === 0
              ? `${d.baseAc}`
              : `${d.baseAc} + модификатор Ловкости (макс. ${d.dexCap})`;
      return (
        <dl>
          <Row label={L.category}>{L.armorCategories[d.category]}</Row>
          <Row label={L.ac}>{ac}</Row>
          {d.strRequirement && <Row label={L.strength}>{d.strRequirement}</Row>}
          <Row label={L.stealth}>{d.stealthDisadvantage ? L.stealthDisadvantage : '—'}</Row>
          <Row label={L.cost}>{formatCost(d.costCp)}</Row>
          <Row label={L.weight}>{formatWeight(d.weightLb)}</Row>
        </dl>
      );
    }
    case 'gear':
    case 'tool': {
      const d = data as GearData;
      return (
        <dl>
          <Row label={L.category}>{L.gearKinds[d.kind]}</Row>
          <Row label={L.cost}>{formatCost(d.costCp)}</Row>
          <Row label={L.weight}>{formatWeight(d.weightLb)}</Row>
          {d.contents?.length ? (
            <Row label={L.contents}>
              <ul className="list-disc pl-5">
                {d.contents.map((c) => (
                  <li key={c.key}>
                    <Link className="underline" href={entityHref(c.key, c.key.split('/')[1]!)}>
                      {c.key.split('/').pop()}
                    </Link>{' '}
                    ×{c.qty}
                  </li>
                ))}
              </ul>
            </Row>
          ) : null}
        </dl>
      );
    }
    case 'spell': {
      const d = data as SpellData;
      const comps = [d.components.v && 'В', d.components.s && 'С', d.components.m && 'М'].filter(Boolean).join(', ');
      return (
        <dl>
          <Row label={L.level}>
            {d.level === 0 ? L.cantrip : `${d.level} круг`}, {SCHOOL_LABEL_RU[d.school]?.toLowerCase()}
            {d.ritual ? ` (${L.ritual})` : ''}
          </Row>
          <Row label={L.castingTime}>{d.castingTime.textRu}</Row>
          <Row label={L.range}>{d.range.textRu}</Row>
          <Row label={L.components}>
            {comps}
            {d.components.materialRu ? ` (${d.components.materialRu})` : ''}
          </Row>
          <Row label={L.duration}>{d.duration.textRu}</Row>
          <Row label={L.classes}>{d.classes.map((c) => SPELL_LIST_RU[c] ?? c).join(', ')}</Row>
          {d.damage?.length ? (
            <Row label={L.damage}>
              {d.damage.map((x) => `${diceRu(x.dice)} ${DAMAGE_TYPE_LABEL_RU[x.type].toLowerCase()}`).join(', ')}
            </Row>
          ) : null}
        </dl>
      );
    }
    case 'item': {
      const d = data as MagicItemData;
      return (
        <dl>
          <Row label={L.category}>{L.itemTypes[d.itemType]}</Row>
          <Row label={L.rarity}>{L.rarities[d.rarity]}</Row>
          <Row label={L.attunement}>{d.attunement === false ? ru.common.no : d.attunement.byRu ? `да (${d.attunement.byRu})` : ru.common.yes}</Row>
        </dl>
      );
    }
    case 'race': {
      const d = data as RaceData;
      return (
        <dl>
          <Row label={L.size}>{SIZE_LABEL_RU[d.size]}</Row>
          <Row label={L.speed}>{formatFeet(d.speed.walk)}</Row>
        </dl>
      );
    }
    case 'background': {
      const d = data as BackgroundData;
      const skills = Array.isArray(d.skills) ? d.skills.map((s) => SKILL_LABEL_RU[s]).join(', ') : `${d.skills.choose} на выбор`;
      return (
        <dl>
          <Row label={L.skills}>{skills}</Row>
          <Row label={L.languages}>{Array.isArray(d.languages) ? d.languages.join(', ') || '—' : `${d.languages.choose} на выбор`}</Row>
          <Row label={L.tools}>{d.tools.join(', ') || '—'}</Row>
        </dl>
      );
    }
    case 'feat': {
      const d = data as FeatData;
      return d.prerequisite ? (
        <dl>
          <Row label={L.prerequisite}>{d.prerequisite.textRu}</Row>
        </dl>
      ) : null;
    }
    case 'language': {
      const d = data as LanguageData;
      return (
        <dl>
          <Row label={L.category}>{d.type === 'exotic' ? 'Экзотический' : d.type === 'secret' ? 'Тайный' : 'Стандартный'}</Row>
          {d.scriptRu && <Row label="Письменность">{d.scriptRu}</Row>}
          {d.speakersRu && <Row label="Носители">{d.speakersRu}</Row>}
        </dl>
      );
    }
    default:
      return null;
  }
}

function ClassTable({ d }: { d: ClassData }) {
  const features = new Map(d.features.map((f) => [f.key, f.nameRu]));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{L.table}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead>{L.levelShort}</TableHead>
              <TableHead>{L.pb}</TableHead>
              <TableHead>{L.features}</TableHead>
              {d.columns.map((c) => (
                <TableHead key={c.key}>{c.labelRu}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {d.levels.map((l) => (
              <TableRow key={l.level}>
                <TableCell>{l.level}</TableCell>
                <TableCell>+{proficiencyBonus(l.level)}</TableCell>
                <TableCell className="min-w-48">
                  {[...(d.asiLevels.includes(l.level) ? ['Увеличение характеристик'] : []), ...l.featureKeys.map((k) => features.get(k) ?? k)].join(', ')}
                </TableCell>
                {d.columns.map((c) => (
                  <TableCell key={c.key}>{diceRu(String(l.values[c.key] ?? '—')) || '—'}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function EntityView({ entityKey }: { entityKey: string }) {
  const trpc = useTRPC();
  const q = useQuery(trpc.content.get.queryOptions({ key: entityKey }));
  const e = q.data;
  return (
    <QueryState isLoading={q.isLoading} error={q.error}>
      {e && (
        <div className="grid gap-4">
          <PageHeader
            title={e.nameRu}
            description={
              <span className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{L.kindOne[e.kind]}</Badge>
                {e.nameEn && <span>{e.nameEn}</span>}
                <span>
                  {ru.common.source}: {e.sourceBook ?? e.packName}
                </span>
                {e.removedAt && <Badge variant="destructive">{L.removed}</Badge>}
              </span>
            }
            actions={
              e.sourceUrl && (
                <Button variant="outline" asChild>
                  <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLinkIcon />
                    {L.openDndsu}
                  </a>
                </Button>
              )
            }
          />
          <Card>
            <CardContent className="grid gap-3">
              <Details kind={e.kind} data={e.data} />
              {e.kind === 'class' && (
                <dl>
                  <Row label={L.hitDie}>к{(e.data as ClassData).hitDie}</Row>
                  <Row label={L.savingThrows}>{(e.data as ClassData).savingThrows.map((a) => ABILITY_LABEL_RU[a]).join(', ')}</Row>
                  <Row label="Подкласс">{L.subclassFrom((e.data as ClassData).subclassLabelRu, (e.data as ClassData).subclassLevel)}</Row>
                </dl>
              )}
              {e.kind === 'subclass' && (
                <Link className="text-sm underline" href={entityHref((e.data as SubclassData).classKey, 'class')}>
                  {ru.library.kindOne.class}
                </Link>
              )}
              {e.kind === 'subrace' && (
                <Link className="text-sm underline" href={entityHref((e.data as SubraceData).raceKey, 'race')}>
                  {ru.library.kindOne.race}
                </Link>
              )}
              {e.textMd && (
                <>
                  {e.packKey === 'srd' && /[a-z]{4,}/i.test(e.textMd) && !/[а-я]/i.test(e.textMd.slice(0, 200)) && (
                    <p className="text-xs text-muted-foreground italic">{L.textEnglish}</p>
                  )}
                  <Markdown>{e.textMd}</Markdown>
                </>
              )}
            </CardContent>
          </Card>
          {e.kind === 'class' && <ClassTable d={e.data as ClassData} />}
          {(e.kind === 'class' || e.kind === 'subclass' || e.kind === 'race' || e.kind === 'subrace' || e.kind === 'feat') && (
            <Features features={(e.data as { features: Feature[] }).features} />
          )}
          {e.kind === 'background' && <Features features={[(e.data as BackgroundData).feature]} />}
        </div>
      )}
    </QueryState>
  );
}
