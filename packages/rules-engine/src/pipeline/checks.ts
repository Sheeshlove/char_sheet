import { ABILITIES, SKILL_ABILITY, SKILLS, type Ability, type SkillId } from '@ps/content-schema';
import { ABILITY_LABEL_RU } from '../tables/abilities';
import type { ComputedSheet, ProfLevel, RollModeInfo, Val, ValPart } from '../types';
import { makeVal, type Pipeline } from './context';
import { bonusParts, modesFor, netUnconditional } from './helpers';
import { modPart } from './abilities';

type HalfProf = { value: number; labelRu: string; initiative: boolean };

function halfProficiency(p: Pipeline, a: Ability): HalfProf | null {
  let best: HalfProf | null = null;
  for (const { effect, src } of p.active('half_proficiency')) {
    const applies = effect.scope === 'checks' || effect.scope.includes(a);
    if (!applies) continue;
    const v = effect.rounding === 'up' ? Math.ceil(p.pb / 2) : Math.floor(p.pb / 2);
    if (!best || v > best.value) best = { value: v, labelRu: src.featureNameRu ?? src.sourceLabelRu, initiative: effect.includeInitiative };
  }
  return best;
}

/** Стадия 6: спасброски, навыки, пассивные значения, инициатива (SPEC §8.5). */
export function computeChecks(p: Pipeline) {
  const pbPart = (label: string, value: number): ValPart => ({ labelRu: label, value });
  const autoFail = new Set<Ability>();
  for (const { effect } of p.active('auto_fail')) for (const a of effect.saves) autoFail.add(a);

  const abilities = {} as ComputedSheet['abilities'];
  for (const a of ABILITIES) {
    const prof = p.profs.has(`save:${a}`);
    const parts: ValPart[] = [modPart(p, a)];
    if (prof) parts.push(pbPart('Владение', p.pb));
    parts.push(...bonusParts(p, [`save:${a}`, 'save:*']));
    const modes = modesFor(p, [`save:${a}`, 'save:*']);
    abilities[a] = {
      score: p.abilities![a].scoreVal,
      mod: p.abilities![a].mod,
      save: makeVal(parts),
      saveProficient: prof,
      autoFail: autoFail.has(a),
      modes: [...modes, ...modesFor(p, [`check:${a}`, 'check:*'])],
    };
  }

  const skills = {} as ComputedSheet['skills'];
  for (const s of SKILLS) {
    const a = SKILL_ABILITY[s];
    const level = p.profs.get(`skill:${s}`);
    const parts: ValPart[] = [modPart(p, a)];
    let prof: ProfLevel = 'none';
    if (level === 'expertise') {
      prof = 'expertise';
      parts.push(pbPart('Компетентность', p.pb * 2));
    } else if (level === 'proficient') {
      prof = 'proficient';
      parts.push(pbPart('Владение', p.pb));
    } else {
      const half = halfProficiency(p, a);
      if (half) {
        prof = 'half';
        parts.push(pbPart(half.labelRu, half.value));
      }
    }
    parts.push(...bonusParts(p, [`skill:${s}`, `check:${a}`, 'check:*']));
    skills[s] = { ability: a, value: makeVal(parts), prof, modes: modesFor(p, [`skill:${s}`, `check:${a}`, 'check:*']) };
  }

  const passive = (s: SkillId): Val => {
    const sk = skills[s];
    const parts: ValPart[] = [
      { labelRu: 'Базовое значение', value: 10 },
      { labelRu: 'Навык', value: sk.value.value },
    ];
    const net = netUnconditional(sk.modes);
    if (net === 1) parts.push({ labelRu: 'Преимущество', value: 5 });
    if (net === -1) parts.push({ labelRu: 'Помеха', value: -5 });
    parts.push(...bonusParts(p, [`passive:${s}`]));
    return makeVal(parts);
  };

  // RULES-NOTE: инициатива = Лов + бонусы initiative + половина БМ (includeInitiative), SPEC §8.5.
  const initParts: ValPart[] = [modPart(p, 'dex')];
  const half = halfProficiency(p, 'dex');
  if (half && half.initiative) initParts.push(pbPart(half.labelRu, half.value));
  initParts.push(...bonusParts(p, ['initiative']));

  const rollModes: RollModeInfo[] = modesFor(p, [
    ...ABILITIES.flatMap((a) => [`save:${a}`, `check:${a}`]),
    'save:*',
    'check:*',
    ...SKILLS.map((s) => `skill:${s}`),
    'attack:*',
    'attack:melee_weapon',
    'attack:ranged_weapon',
    'attack:spell',
    'attacks_against_you',
    'death_save',
    'concentration',
    'initiative',
  ]);

  return {
    abilities,
    skills,
    passives: { perception: passive('perception'), investigation: passive('investigation'), insight: passive('insight') },
    initiative: makeVal(initParts),
    rollModes,
  };
}

export { ABILITY_LABEL_RU };
