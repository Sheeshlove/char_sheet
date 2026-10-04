import type { Ability } from './constants';
import type { CharacterBuild, CharacterState } from './character';

/** Пустые сборка и состояние персонажа (без zod — нужны и в браузере). */
export const EMPTY_ABILITIES: Record<Ability, number> = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };

export function emptyBuild(name = ''): CharacterBuild {
  return {
    schemaVersion: 1,
    status: 'draft',
    identity: { name, personality: { traits: '', ideals: '', bonds: '', flaws: '' } },
    abilities: { method: 'standard_array', base: { ...EMPTY_ABILITIES } },
    race: '',
    background: '',
    classes: [],
    levels: [],
    choices: {},
    knownSpells: [],
    manualEffects: [],
    overrides: {},
  };
}

export function emptyState(): CharacterState {
  return {
    hp: { current: 0, temp: 0 },
    hitDiceUsed: { d6: 0, d8: 0, d10: 0, d12: 0 },
    deathSaves: { successes: 0, failures: 0, stable: false, dead: false },
    slotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    pactSlotsUsed: 0,
    resourcesUsed: {},
    grantUsesUsed: {},
    toggles: [],
    conditions: [],
    exhaustion: 0,
    inspiration: false,
    xp: 0,
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    inventory: [],
    prepared: {},
  };
}
