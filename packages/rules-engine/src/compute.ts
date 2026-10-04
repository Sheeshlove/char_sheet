import type { CampaignSettings, CharacterBuild, CharacterState } from '@ps/content-schema';
import type { ContentIndex } from './content-index';
import { ENGINE_VERSION } from './version';
import { Pipeline } from './pipeline/context';
import { collectEquipment, collectLevels, collectSources, collectSpellToggles } from './pipeline/collect';
import { computeAbilities, computePb } from './pipeline/abilities';
import { computeProficiencies } from './pipeline/proficiencies';
import { computeChecks } from './pipeline/checks';
import { computeAc } from './pipeline/ac';
import { computeCarrying, computeSenses, computeSize, computeSpeed } from './pipeline/movement';
import { computeHp } from './pipeline/hp';
import { computeAttacks, spellAttackLines } from './pipeline/attacks';
import { computeSpellcasting, knownSpellKeys } from './pipeline/spellcasting';
import { computeResources } from './pipeline/resources';
import { applyOverrides } from './pipeline/overrides';
import { levelChoices } from './builder/level-choices';
import { nextLevelXp } from './tables/xp';
import type { ComputedSheet, DefenseLine } from './types';
import { labelOf } from './pipeline/helpers';

export type ComputeResult = { sheet: ComputedSheet; pipeline: Pipeline };

/** Полный расчёт листа по стадиям SPEC §8.4. */
export function computeWithPipeline(
  build: CharacterBuild,
  state: CharacterState,
  content: ContentIndex,
  rules: CampaignSettings,
): ComputeResult {
  const p = new Pipeline(build, state, content, rules);

  // 1–2. Источники и выборы
  collectLevels(p);
  p.equipment = collectEquipment(p);
  collectSources(p);
  collectSpellToggles(p, knownSpellKeys(p));

  // 3–4. Характеристики и бонус мастерства
  p.abilities = computeAbilities(p);
  const pb = computePb(p);
  p.pb = pb.value;
  p.invalidateExprCache();

  // 5. Владения
  const proficiencies = computeProficiencies(p);

  // 8 (частично). Размер и нагрузка нужны раньше проверок: сильная нагрузка даёт помехи.
  const size = computeSize(p);
  const carrying = computeCarrying(p, size);

  // 6. Спасброски, навыки, пассивы, инициатива
  const checks = computeChecks(p);

  // 7. КД
  const ac = computeAc(p);

  // 8. Скорость, чувства
  const speed = computeSpeed(p, carrying);
  const senses = computeSenses(p);

  // 9. Хиты
  const { hp, hitDice } = computeHp(p);

  // 11. Заклинательство (до атак: атаки заклинаниями используют Сл и бонус атаки класса)
  const { spellcasting, choices: spellChoices } = computeSpellcasting(p);

  // 10. Атаки
  const { attacks, attacksPerAction, critMin } = computeAttacks(p);
  attacks.push(...spellAttackLines(p, spellcasting));

  // 12. Ресурсы, переключатели, умения
  const { resources, toggles, features } = computeResources(p);

  // Защиты
  const defenses: ComputedSheet['defenses'] = { resistances: [], immunities: [], vulnerabilities: [], conditionImmunities: [] };
  for (const { effect, src } of p.active('defense')) {
    const line: DefenseLine = { damageType: effect.damageType, noteRu: effect.noteRu, sourceKey: src.sourceKey, sourceLabelRu: labelOf(src) };
    const list = effect.kind === 'resistance' ? defenses.resistances : effect.kind === 'immunity' ? defenses.immunities : defenses.vulnerabilities;
    if (!list.some((l) => l.damageType === line.damageType)) list.push(line);
  }
  for (const { effect } of p.active('condition_immunity')) {
    if (!defenses.conditionImmunities.includes(effect.condition)) defenses.conditionImmunities.push(effect.condition);
  }

  // Выборы уровня (подкласс, ASI, хиты) и заклинаний
  const allChoices = [...p.choices, ...levelChoices(p), ...spellChoices];
  const pendingChoices = allChoices.filter((c) => c.selected.length < c.choose);

  const race = content.get(build.race);
  const subrace = content.get(build.subrace);
  const bg = content.get(build.background);
  const classLabel = build.classes
    .map((c) => {
      const lvl = p.classLevel(c.classKey);
      const name = content.get(c.classKey)?.nameRu ?? c.classKey;
      const subName = c.subclassKey ? content.get(c.subclassKey)?.nameRu : undefined;
      return `${name}${subName ? ` (${subName})` : ''} ${lvl}`;
    })
    .join(' / ');

  const next = nextLevelXp(p.totalLevel);
  const concentration = state.concentration
    ? { spellKey: state.concentration.spellKey, nameRu: content.get(state.concentration.spellKey)?.nameRu ?? state.concentration.spellKey }
    : undefined;

  if (state.exhaustion >= 6) {
    p.issues.push({ severity: 'warning', code: 'exhaustion_death', messageRu: 'Истощение 6: персонаж умирает.' });
  }

  const sheet: ComputedSheet = {
    engineVersion: ENGINE_VERSION,
    identity: {
      name: build.identity.name,
      raceLabelRu: subrace?.nameRu ?? race?.nameRu ?? '',
      classLabelRu: classLabel,
      backgroundLabelRu: bg?.nameRu ?? '',
    },
    level: { total: p.totalLevel, byClass: Object.fromEntries([...p.classLevels].filter(([, l]) => l > 0)) },
    pb,
    abilities: checks.abilities,
    skills: checks.skills,
    passives: checks.passives,
    initiative: checks.initiative,
    ac,
    speed,
    size,
    senses,
    hp,
    hitDice,
    defenses,
    rollModes: checks.rollModes,
    proficiencies,
    attacks,
    attacksPerAction,
    critMin,
    resources,
    toggles,
    spellcasting,
    carrying,
    features,
    choices: allChoices,
    pendingChoices,
    issues: p.issues,
    xp: {
      current: state.xp,
      nextLevelAt: next,
      canLevelUp:
        rules.leveling === 'xp' ? next !== null && state.xp >= next : (state.milestoneLevel ?? build.levels.length) > build.levels.length,
    },
    status: {
      conditions: p.activeConditions,
      exhaustion: state.exhaustion,
      concentration,
      inspiration: state.inspiration,
      deathSaves: state.deathSaves,
      dead: state.deathSaves.dead || state.exhaustion >= 6,
      unconscious: p.totalLevel > 0 && hp.current === 0 && !state.deathSaves.dead,
    },
  };

  // 13. Переопределения
  applyOverrides(p, sheet);
  sheet.hp.current = Math.max(0, Math.min(state.hp.current, sheet.hp.max.value));
  return { sheet, pipeline: p };
}

export function compute(
  build: CharacterBuild,
  state: CharacterState,
  content: ContentIndex,
  rules: CampaignSettings,
): ComputedSheet {
  return computeWithPipeline(build, state, content, rules).sheet;
}
