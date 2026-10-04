import type {
  BackgroundData,
  ClassData,
  ClassSpellcasting,
  ContentEntity,
  ContentKind,
  Effect,
  FeatData,
  Feature,
  MagicItemData,
  ProfTarget,
  RaceData,
  SpellData,
  SubclassData,
  SubraceData,
} from '@ps/content-schema';
import { applyOverlays, type Overlay } from '../overlays';
import { slugify, translitSlug } from '../util/text';
import {
  asiLevelsOf,
  inferProgression,
  matchName,
  parseArmor,
  parseClassTable,
  parseHitDie,
  parseSavingThrows,
  parseSkillChoice,
  parseSpellAbility,
  parseWeapons,
} from './extract/class';
import {
  parseBackgroundLanguages,
  parseBackgroundSkills,
  parseGold,
  parseItemMechanics,
  parseItemTypeLine,
} from './extract/item';
import { parseAsi, parseDarkvision, parseLanguages, parseSize, parseSpeed } from './extract/race';
import { extractSpell, type SpellFields } from './extract/spell';
import type { KeyMap } from './key-map';
import { leadBlocks, mdTables, splitBlocks, stripMd, type MdTable } from './parse/text';
import type { ParsedRecord } from './parse/record';
import { externalKey, packOf, parseEntityUrl, type Section } from './sections';
import { norm, type TermDictionary } from './terms';

export type BuildProblem = { key: string; url: string; field: string; value?: string };
export type BuildWarning = { key: string; message: string };

export type BuildInput = {
  records: ParsedRecord[];
  keyMap: KeyMap;
  /** Сущности пакета `srd`: эталон механики (слой 2) и словари названий снаряжения. */
  srd: ContentEntity[];
  overlays: Record<string, Overlay[]>;
  dict?: TermDictionary;
};

export type BuildResult = {
  packs: Record<string, ContentEntity[]>;
  problems: BuildProblem[];
  warnings: BuildWarning[];
  /** Число разобранных записей по секции (для сверки со страницами-списками). */
  counts: Record<string, { parsed: number; built: number }>;
};

const PROF = (target: string): Effect => ({ type: 'proficiency', target: target as ProfTarget, level: 'proficient' });

function status(effects: Effect[]): Feature['effectsStatus'] {
  if (!effects.length) return 'text_only';
  return effects.some((e) => e.type === 'text') ? 'partial' : 'complete';
}

export function entityStatusOf(features: Feature[]): ContentEntity['effectsStatus'] {
  const visible = features.filter((f) => !f.hidden);
  if (!visible.length || visible.every((f) => f.effectsStatus === 'text_only')) return 'text_only';
  if (visible.every((f) => f.effectsStatus === 'complete')) return 'complete';
  return 'partial';
}

function nameMaps(srd: ContentEntity[]) {
  const by = (kinds: ContentKind[]) =>
    new Map(srd.filter((e) => kinds.includes(e.kind)).map((e) => [norm(e.nameRu), e.slug] as const));
  const keys = (kinds: ContentKind[]) =>
    new Map(srd.filter((e) => kinds.includes(e.kind)).map((e) => [norm(e.nameRu), e.key] as const));
  return { weapons: by(['weapon']), tools: by(['tool']), baseItems: keys(['weapon', 'armor']) };
}

/** Эталон SRD по английскому названию (слой 2, SPEC §7.6). */
function srdMatch(srd: ContentEntity[], kind: ContentKind, nameEn?: string): ContentEntity | undefined {
  if (!nameEn) return undefined;
  const s = slugify(nameEn);
  return srd.find((e) => e.kind === kind && (e.slug === s || (e.nameEn && slugify(e.nameEn) === s)));
}

export function buildDndsu(input: BuildInput): BuildResult {
  const { records, keyMap, srd, dict } = input;
  const names = nameMaps(srd);
  const problems: BuildProblem[] = [];
  const warnings: BuildWarning[] = [];
  const packs: Record<string, ContentEntity[]> = {};
  const counts: BuildResult['counts'] = {};
  const push = (pack: string, e: ContentEntity) => (packs[pack] ??= []).push(e);
  const count = (r: ParsedRecord, built: boolean) => {
    const k = `${r.homebrew ? 'homebrew/' : ''}${r.section}`;
    const c = (counts[k] ??= { parsed: 0, built: 0 });
    c.parsed++;
    if (built) c.built++;
  };

  const keyOf = (r: ParsedRecord, kind: ContentKind) =>
    keyMap.entityKey(externalKey(r), packOf(r.homebrew), kind, parseEntityUrl(r.url)?.slug ?? String(r.externalId), r.externalId);

  const base = (r: ParsedRecord, kind: ContentKind, key: string) => ({
    key,
    kind,
    slug: key.split('/')[2]!,
    nameRu: r.nameRu,
    ...(r.nameEn ? { nameEn: r.nameEn } : {}),
    ...(r.sourceBook ? { sourceBook: r.sourceBook } : {}),
    sourceUrl: r.url,
    textMd: r.bodyMd,
  });

  const feature = (entityKey: string, headingRu: string, headingEn: string | undefined, md: string, level?: number): Feature => ({
    key: keyMap.featureKey(entityKey, headingRu, headingEn ? slugify(headingEn) : translitSlug(headingRu)),
    nameRu: headingRu,
    ...(headingEn ? { nameEn: headingEn } : {}),
    ...(level ? { level } : {}),
    textMd: md,
    effects: [],
    effectsStatus: 'text_only',
  });

  // Порядок: заклинания раньше подклассов (списки заклинаний подклассов ссылаются на них).
  const order: Section[] = ['spells', 'items', 'feats', 'backgrounds', 'races', 'classes'];
  const sorted = [...records].sort(
    (a, b) => order.indexOf(a.section) - order.indexOf(b.section) || a.externalId - b.externalId,
  );
  const spellByName = new Map<string, string>();
  const classByUrl = new Map<string, string>();
  const subclassRecords: ParsedRecord[] = [];

  for (const r of sorted) {
    const f = r.fields as Record<string, unknown>;
    const pack = packOf(r.homebrew);
    switch (r.section) {
      case 'spells': {
        const key = keyOf(r, 'spell');
        const { data, problems: p } = extractSpell(f as SpellFields, r.bodyMd, dict);
        p.forEach((x) => problems.push({ key, url: r.url, ...x }));
        if (!data) {
          count(r, false);
          break;
        }
        const ref = srdMatch(srd, 'spell', r.nameEn);
        if (ref) {
          const s = ref.data as SpellData;
          if (s.level !== data.level) warnings.push({ key, message: `круг ${data.level} ≠ SRD ${s.level}` });
          if (s.school !== data.school) warnings.push({ key, message: `школа ${data.school} ≠ SRD ${s.school}` });
          if (s.components.v !== data.components.v || s.components.s !== data.components.s || s.components.m !== data.components.m) {
            warnings.push({ key, message: 'компоненты расходятся с SRD' });
          }
          if (s.duration.concentration !== data.duration.concentration) warnings.push({ key, message: 'концентрация расходится с SRD' });
          if (s.ritual !== data.ritual) warnings.push({ key, message: 'ритуал расходится с SRD' });
          // Механика SRD побеждает.
          Object.assign(data, { level: s.level, school: s.school, ritual: s.ritual });
          if (s.damage) data.damage = s.damage;
          if (s.heal) data.heal = s.heal;
          if (s.save) data.save = s.save;
          if (s.attack) data.attack = s.attack;
        }
        const full: SpellData = { ...data, subclasses: [] };
        spellByName.set(norm(r.nameRu), key);
        push(pack, { ...base(r, 'spell', key), kind: 'spell', data: full, effectsStatus: 'complete' });
        count(r, true);
        break;
      }
      case 'items': {
        const key = keyOf(r, 'item');
        const head = parseItemTypeLine(f.typeLine as string | undefined, names.baseItems, dict);
        if (!head) {
          problems.push({ key, url: r.url, field: 'typeLine', value: f.typeLine as string | undefined });
          count(r, false);
          break;
        }
        const mech = parseItemMechanics(r.bodyMd, head.itemType);
        const data: MagicItemData = {
          ...head,
          effects: mech.effects,
          effectsStatus: mech.effects.length ? status(mech.effects) : 'text_only',
          ...(mech.charges ? { charges: mech.charges } : {}),
        };
        push(pack, { ...base(r, 'item', key), kind: 'item', data, effectsStatus: data.effectsStatus });
        count(r, true);
        break;
      }
      case 'feats': {
        const key = keyOf(r, 'feat');
        const prereq = f.prerequisite as string | undefined;
        const data: FeatData = {
          ...(prereq ? { prerequisite: { textRu: prereq } } : {}),
          repeatable: false,
          features: [feature(key, r.nameRu, r.nameEn, r.bodyMd)],
        };
        push(pack, { ...base(r, 'feat', key), kind: 'feat', data, effectsStatus: 'text_only' });
        count(r, true);
        break;
      }
      case 'backgrounds': {
        const key = keyOf(r, 'background');
        const skills = parseBackgroundSkills(f.skills as string | undefined, dict);
        if (!skills.length) problems.push({ key, url: r.url, field: 'skills', value: f.skills as string | undefined });
        const toolsText = (f.tools as string | undefined) ?? '';
        const tools = /^нет/i.test(toolsText.trim())
          ? []
          : toolsText
              .split(/,|\sи\s/)
              .map((t) => matchName(t, names.tools))
              .filter((x): x is string => !!x);
        const featBlock = r.blocks.find((b) => /^(?:умение|особенность)\s*:/i.test(b.headingRu));
        if (!featBlock) problems.push({ key, url: r.url, field: 'feature' });
        const chars = characteristics(mdTables(r.bodyMd));
        if (!skills.length || !featBlock) {
          count(r, false);
          break;
        }
        const featName = featBlock.headingRu.replace(/^(?:умение|особенность)\s*:\s*/i, '');
        const data: BackgroundData = {
          skills,
          tools,
          languages: parseBackgroundLanguages(f.languages as string | undefined, dict),
          equipmentMd: (f.equipment as string | undefined) ?? '',
          gold: parseGold(f.equipment as string | undefined),
          feature: feature(key, featName, featBlock.headingEn, featBlock.md),
          characteristics: chars,
        };
        push(pack, { ...base(r, 'background', key), kind: 'background', data, effectsStatus: 'text_only' });
        count(r, true);
        break;
      }
      case 'races': {
        const subKeyOf = (slug: string) =>
          keyMap.entityKey(
            `${externalKey(r)}#${slug}`,
            packOf(r.homebrew),
            'subrace',
            `${parseEntityUrl(r.url)?.slug ?? r.externalId}-${slug}`,
            r.externalId,
          );
        const built = buildRace(r, keyOf, subKeyOf, feature, dict, problems);
        if (built) built.forEach((e) => push(pack, e));
        count(r, !!built);
        break;
      }
      case 'classes': {
        if (f.kindHint === 'subclass') {
          subclassRecords.push(r);
          break;
        }
        const e = buildClass(r, keyOf(r, 'class'), feature, srd, names, dict, problems, warnings);
        if (e) {
          push(pack, e);
          classByUrl.set(r.url, e.key);
        }
        count(r, !!e);
        break;
      }
    }
  }

  // Подклассы: после классов (нужен ключ родителя) и заклинаний (списки заклинаний).
  for (const r of subclassRecords) {
    const key = keyOf(r, 'subclass');
    const parentUrl = (r.fields as { parentUrl?: string }).parentUrl;
    const classKey = parentUrl ? classByUrl.get(parentUrl) : undefined;
    if (!classKey) {
      problems.push({ key, url: r.url, field: 'parentClass', value: parentUrl });
      count(r, false);
      continue;
    }
    const features = r.blocks
      .filter((b) => !/заклинани/i.test(b.headingRu) || b.level)
      .map((b) => feature(key, b.headingRu, b.headingEn, b.md, b.level));
    const data: SubclassData = { classKey, features };
    const spellTables = subclassSpellTables(mdTables(r.bodyMd), spellByName, (name) =>
      problems.push({ key, url: r.url, field: 'subclassSpell', value: name }),
    );
    if (spellTables.alwaysPrepared.length) data.alwaysPrepared = spellTables.alwaysPrepared;
    if (spellTables.expanded.length) data.expandedSpellList = spellTables.expanded;
    push(packOf(r.homebrew), { ...base(r, 'subclass', key), kind: 'subclass', data, effectsStatus: entityStatusOf(features) });
    count(r, true);
  }

  // Заклинания ↔ подклассы («Архетипы: …») — по русскому названию подкласса.
  for (const list of Object.values(packs)) {
    const subByName = new Map(list.filter((e) => e.kind === 'subclass').map((e) => [norm(e.nameRu), e.key]));
    for (const e of list) {
      if (e.kind !== 'spell') continue;
      const rec = records.find((r) => r.url === e.sourceUrl);
      const text = (rec?.fields as SpellFields | undefined)?.subclasses;
      if (!text) continue;
      for (const part of text.split(/,\s*/)) {
        const k = subByName.get(norm(stripMd(part)));
        if (k) e.data.subclasses.push(k);
      }
    }
  }

  for (const [pack, list] of Object.entries(packs)) {
    for (const w of applyOverlays(list, input.overlays[pack] ?? [])) warnings.push({ key: pack, message: w });
    list.sort((a, b) => a.key.localeCompare(b.key));
  }
  return { packs, problems, warnings, counts };
}

function characteristics(tables: MdTable[]): BackgroundData['characteristics'] {
  const col = (re: RegExp) => {
    const t = tables.find((x) => x.headers.some((h) => re.test(h)));
    if (!t) return [];
    const idx = t.headers.findIndex((h) => re.test(h));
    return t.rows.map((r) => r[idx] ?? '').filter(Boolean);
  };
  return {
    traits: col(/черт\S* характера/i),
    ideals: col(/идеал/i),
    bonds: col(/привязанност/i),
    flaws: col(/слабост/i),
  };
}

/** Таблицы заклинаний подкласса: «Уровень <класса> | Заклинания» и «Уровень заклинания | Заклинания». */
function subclassSpellTables(tables: MdTable[], spellByName: Map<string, string>, missing: (name: string) => void) {
  const alwaysPrepared: NonNullable<SubclassData['alwaysPrepared']> = [];
  const expanded: NonNullable<SubclassData['expandedSpellList']> = [];
  for (const t of tables) {
    const lvlIdx = t.headers.findIndex((h) => /уровень/i.test(h));
    const spIdx = t.headers.findIndex((h) => /заклинани/i.test(h));
    if (lvlIdx < 0 || spIdx < 0 || lvlIdx === spIdx) continue;
    const isSpellLevel = /уровень\s+заклинани/i.test(t.headers[lvlIdx]!);
    for (const row of t.rows) {
      const level = Number(/(\d+)/.exec(row[lvlIdx] ?? '')?.[1]);
      if (!level) continue;
      const spells = (row[spIdx] ?? '')
        .split(/,\s*/)
        .map((n) => n.trim())
        .filter(Boolean)
        .flatMap((n) => {
          const k = spellByName.get(norm(n));
          if (!k) missing(n);
          return k ? [k] : [];
        });
      if (!spells.length) continue;
      if (isSpellLevel && level <= 9) expanded.push({ spellLevel: level, spells });
      else alwaysPrepared.push({ classLevel: level, spells });
    }
  }
  return { alwaysPrepared, expanded };
}

type FeatureFactory = (entityKey: string, headingRu: string, headingEn: string | undefined, md: string, level?: number) => Feature;

function buildRace(
  r: ParsedRecord,
  keyOf: (r: ParsedRecord, kind: ContentKind) => string,
  subKeyOf: (slug: string) => string,
  feature: FeatureFactory,
  dict: TermDictionary | undefined,
  problems: BuildProblem[],
): ContentEntity[] | null {
  const f = r.fields as Record<string, string | undefined>;
  const key = keyOf(r, 'race');
  const size = parseSize(f.size, dict);
  const speed = parseSpeed(f.speed);
  if (!size) problems.push({ key, url: r.url, field: 'size', value: f.size });
  if (!speed) problems.push({ key, url: r.url, field: 'speed', value: f.speed });
  if (!size || !speed) return null;

  const traitFeatures = (entityKey: string, md: string): Feature[] =>
    leadBlocks(md)
      .filter((b) => !/^(возраст|мировоззрение|размер|скорость)/i.test(b.headingRu))
      .map((b) => {
        const feat = feature(entityKey, b.headingRu, b.headingEn, b.md);
        const effects: Effect[] = [];
        if (/увеличение характеристик/i.test(b.headingRu)) effects.push(...(parseAsi(b.md, dict) ?? []));
        else if (/т[её]мное зрение/i.test(b.headingRu)) {
          const ft = parseDarkvision(b.md);
          if (ft) effects.push({ type: 'sense', sense: 'darkvision', rangeFt: ft, op: 'set_max' });
        } else if (/^языки/i.test(b.headingRu)) {
          const l = parseLanguages(b.md, dict);
          effects.push(...l.known.map((id) => PROF(`language:${id}`)));
          if (l.choose) {
            effects.push({ type: 'choice', id: 'languages', labelRu: 'Языки', choose: l.choose, options: { kind: 'languages' } });
          }
        }
        feat.effects = effects;
        feat.effectsStatus = status(effects);
        return feat;
      });

  // Подрасы на той же странице: разделы, в которых есть своё «Увеличение характеристик».
  const sections = splitBlocks(r.bodyMd).filter((b) => b.headingRu && leadBlocks(b.md).some((l) => /увеличение характеристик/i.test(l.headingRu)));
  const out: ContentEntity[] = [];
  const mainMd = sections.length ? r.bodyMd.slice(0, r.bodyMd.indexOf(sections[0]!.md)) : r.bodyMd;
  const features = traitFeatures(key, mainMd);
  const data: RaceData = {
    size,
    speed,
    subraceRequired: sections.length > 0,
    features,
    ...(f.age ? { ageMd: f.age } : {}),
    ...(f.alignment ? { alignmentMd: f.alignment } : {}),
  };
  out.push({
    key,
    kind: 'race',
    slug: key.split('/')[2]!,
    nameRu: r.nameRu,
    ...(r.nameEn ? { nameEn: r.nameEn } : {}),
    ...(r.sourceBook ? { sourceBook: r.sourceBook } : {}),
    sourceUrl: r.url,
    textMd: r.bodyMd,
    data,
    effectsStatus: entityStatusOf(features),
  });
  for (const s of sections) {
    const slug = s.headingEn ? slugify(s.headingEn) : translitSlug(s.headingRu);
    const subKey = subKeyOf(slug);
    const subFeatures = traitFeatures(subKey, s.md);
    const sd: SubraceData = { raceKey: key, features: subFeatures };
    out.push({
      key: subKey,
      kind: 'subrace',
      slug: subKey.split('/')[2]!,
      nameRu: s.headingRu,
      ...(s.headingEn ? { nameEn: s.headingEn } : {}),
      ...(r.sourceBook ? { sourceBook: r.sourceBook } : {}),
      sourceUrl: r.url,
      textMd: s.md,
      data: sd,
      effectsStatus: entityStatusOf(subFeatures),
    });
  }
  return out;
}

function buildClass(
  r: ParsedRecord,
  key: string,
  feature: FeatureFactory,
  srd: ContentEntity[],
  names: ReturnType<typeof nameMaps>,
  dict: TermDictionary | undefined,
  problems: BuildProblem[],
  warnings: BuildWarning[],
): ContentEntity | null {
  const f = r.fields as Record<string, unknown>;
  const s = (k: string) => f[k] as string | undefined;
  const table = f.table ? parseClassTable(f.table as MdTable) : null;
  if (!table) problems.push({ key, url: r.url, field: 'table' });
  const hitDie = parseHitDie(s('hitDie'));
  if (!hitDie) problems.push({ key, url: r.url, field: 'hitDie', value: s('hitDie') });
  const saves = parseSavingThrows(s('savingThrows'), dict);
  if (!saves) problems.push({ key, url: r.url, field: 'savingThrows', value: s('savingThrows') });
  const armor = parseArmor(s('armor'), dict);
  if (!armor) problems.push({ key, url: r.url, field: 'armor', value: s('armor') });
  const weapons = parseWeapons(s('weapons'), names.weapons, dict);
  if (!weapons) problems.push({ key, url: r.url, field: 'weapons', value: s('weapons') });
  weapons?.unknown.forEach((w) => problems.push({ key, url: r.url, field: 'weapons', value: w }));
  const skills = parseSkillChoice(s('skills'), dict);
  if (!skills) problems.push({ key, url: r.url, field: 'skills', value: s('skills') });
  const toolsText = s('tools') ?? '';
  const tools = /^нет/i.test(toolsText.trim())
    ? []
    : toolsText
        .split(/,|\sи\s/)
        .map((t) => matchName(t, names.tools))
        .filter((x): x is string => !!x);

  // Умения: блоки с заголовками; уровень — из текста блока или из таблицы по названию.
  const levelByName = new Map<string, number>();
  table?.levels.forEach((l) => l.featureNames.forEach((n) => levelByName.has(norm(n)) || levelByName.set(norm(n), l.level)));
  const skipBlock = /^(хиты|владение|снаряжение|классовые умения|мультиклассирование|быстрое создание)/i;
  const features = r.blocks
    .filter((b) => !skipBlock.test(b.headingRu))
    .map((b) => feature(key, b.headingRu, b.headingEn, b.md, b.level ?? levelByName.get(norm(b.headingRu))));
  const featureByName = new Map(features.map((x) => [norm(x.nameRu), x.key]));

  const ref = srdMatch(srd, 'class', r.nameEn);
  const refData = ref?.data as ClassData | undefined;
  if (refData) {
    if (hitDie && hitDie !== refData.hitDie) warnings.push({ key, message: `кость хитов к${hitDie} ≠ SRD к${refData.hitDie}` });
    if (saves && saves.join() !== refData.savingThrows.join()) warnings.push({ key, message: `спасброски ${saves} ≠ SRD ${refData.savingThrows}` });
    const asi = table ? asiLevelsOf(table) : [];
    if (table && asi.join() !== refData.asiLevels.join()) warnings.push({ key, message: `уровни ASI ${asi} ≠ SRD ${refData.asiLevels}` });
    if (table && refData.spellcasting) {
      const p = inferProgression(table);
      if (p !== refData.spellcasting.progression) warnings.push({ key, message: `ячейки: ${p ?? 'не распознано'} ≠ SRD ${refData.spellcasting.progression}` });
    }
  } else if (!table || !hitDie || !saves || !armor || !weapons || !skills) {
    return null;
  }

  const levels: ClassData['levels'] = (table?.levels ?? refData!.levels.map((l) => ({ level: l.level, featureNames: [], values: l.values }))).map(
    (l) => ({
      level: l.level,
      featureKeys: l.featureNames.flatMap((n) => {
        if (/увеличение характеристик/i.test(n)) return [];
        const k = featureByName.get(norm(n));
        return k ? [k] : [];
      }),
      values: refData ? (refData.levels.find((x) => x.level === l.level)?.values ?? l.values) : l.values,
    }),
  );
  for (const l of table?.levels ?? []) {
    for (const n of l.featureNames) {
      if (!/увеличение характеристик/i.test(n) && !featureByName.has(norm(n))) {
        problems.push({ key, url: r.url, field: `feature@${l.level}`, value: n });
      }
    }
  }

  let spellcasting: ClassSpellcasting | undefined = refData?.spellcasting;
  if (!refData && table && (table.slots || table.pact)) {
    const progression = inferProgression(table);
    const ability = parseSpellAbility(r.bodyMd, dict);
    if (!progression) problems.push({ key, url: r.url, field: 'spellcasting.progression' });
    if (!ability) problems.push({ key, url: r.url, field: 'spellcasting.ability' });
    if (progression && ability) {
      const prepared = /подгот(?:ов|авлива)\S*\s+(?:список|заклинани)/i.test(r.bodyMd);
      const half = /половин\S*\s+(?:вашего\s+)?уровн/i.test(r.bodyMd);
      const A = ability.toUpperCase();
      spellcasting = {
        ability,
        progression,
        preparation: prepared ? 'prepared' : 'known',
        spellListKey: key.split('/')[2]!,
        ...(table.cantripsKnown ? { cantripsKnown: table.cantripsKnown } : {}),
        ...(table.spellsKnown ? { spellsKnown: table.spellsKnown } : {}),
        ...(prepared ? { preparedFormula: half ? `max(1, floor(CLASS_LEVEL / 2) + ${A})` : `max(1, CLASS_LEVEL + ${A})` } : {}),
        ritualCasting: r.blocks.some((b) => /ритуал/i.test(b.headingRu)) ? 'prepared_only' : 'none',
      };
    }
  }

  // Уровень подкласса: умение, в тексте которого говорится о выборе подкласса/архетипа,
  // иначе строка таблицы с типичным названием («Путь…», «Архетип…», «Круг…»).
  const SUBCLASS_NAME = /архетип|путь|коллеги|домен|круг|традиц|клятв|происхождени|покровител|специализаци|подкласс/i;
  const bySubclassText = features.find((x) => x.level && /подкласс|архетип/i.test(x.textMd));
  const byTable = table?.levels.find((l) => l.featureNames.some((n) => SUBCLASS_NAME.test(n)));
  const subclassLevel = refData?.subclassLevel ?? bySubclassText?.level ?? byTable?.level;
  if (!subclassLevel) {
    problems.push({ key, url: r.url, field: 'subclassLevel' });
    if (!refData) return null;
  }
  const subclassLabelRu =
    refData?.subclassLabelRu ?? bySubclassText?.nameRu ?? byTable?.featureNames.find((n) => SUBCLASS_NAME.test(n)) ?? 'Подкласс';

  const data: ClassData = {
    hitDie: refData?.hitDie ?? hitDie!,
    savingThrows: refData?.savingThrows ?? saves!,
    multiclassRequirement: refData?.multiclassRequirement ?? {},
    proficiencies: refData?.proficiencies ?? { armor: armor!, weapons: weapons!.weapons, tools, skills: skills! },
    multiclassProficiencies: refData?.multiclassProficiencies ?? { armor: [], weapons: [], tools: [] },
    startingEquipment: refData?.startingEquipment ?? [],
    startingGold: refData?.startingGold ?? '',
    subclassLevel: subclassLevel ?? refData!.subclassLevel,
    subclassLabelRu,
    asiLevels: refData?.asiLevels ?? (table ? asiLevelsOf(table) : []),
    ...(spellcasting ? { spellcasting } : {}),
    columns: refData?.columns ?? table?.columns ?? [],
    levels,
    features,
  };
  if (!refData) warnings.push({ key, message: 'нет эталона SRD: мультикласс и стартовое снаряжение — только текстом' });
  return {
    key,
    kind: 'class',
    slug: key.split('/')[2]!,
    nameRu: r.nameRu,
    ...(r.nameEn ? { nameEn: r.nameEn } : {}),
    ...(r.sourceBook ? { sourceBook: r.sourceBook } : {}),
    sourceUrl: r.url,
    textMd: r.bodyMd,
    data,
    effectsStatus: entityStatusOf(features),
  };
}
