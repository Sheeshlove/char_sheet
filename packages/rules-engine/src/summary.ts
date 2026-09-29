import { ABILITIES, type Ability } from '@ps/content-schema';
import type { ComputedSheet, SheetSummary } from './types';

/** Краткая сводка листа для `computed_cache` и панели мастера (SPEC §8.1, §13). */
export function summarize(sheet: ComputedSheet): SheetSummary {
  return {
    engineVersion: sheet.engineVersion,
    name: sheet.identity.name,
    raceLabelRu: sheet.identity.raceLabelRu,
    classLabelRu: sheet.identity.classLabelRu,
    level: sheet.level.total,
    hp: { max: sheet.hp.max.value, current: sheet.hp.current, temp: sheet.hp.temp },
    ac: sheet.ac.value,
    initiative: sheet.initiative.value,
    speedWalk: sheet.speed.walk?.value ?? 0,
    pb: sheet.pb.value,
    passives: {
      perception: sheet.passives.perception.value,
      insight: sheet.passives.insight.value,
      investigation: sheet.passives.investigation.value,
    },
    saves: Object.fromEntries(ABILITIES.map((a) => [a, sheet.abilities[a].save.value])) as Record<Ability, number>,
    spellDcs: sheet.spellcasting.classes.map((c) => ({ classKey: c.classKey, nameRu: c.nameRu, dc: c.dc.value })),
    slots: sheet.spellcasting.slots,
    pact: sheet.spellcasting.pact,
    conditions: sheet.status.conditions,
    exhaustion: sheet.status.exhaustion,
    concentration: sheet.status.concentration?.nameRu,
    inspiration: sheet.status.inspiration,
    xp: sheet.xp,
    pendingChoices: sheet.pendingChoices.length,
    dead: sheet.status.dead,
  };
}
