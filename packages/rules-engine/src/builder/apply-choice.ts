import { ABILITIES, emptyState, type Ability, type CampaignSettings, type CharacterBuild } from '@ps/content-schema';
import type { ContentIndex } from '../content-index';
import { computeWithPipeline } from '../compute';
import { clone } from '../util';

/**
 * Записывает выбор из листа (`ChoiceInfo.key`) в сборку: выборы умений, подкласс,
 * ASI/черта, бросок хитов, заговоры/известные заклинания/книга (SPEC §9, §10).
 */
export function applyChoice(build: CharacterBuild, key: string, selected: string[]): CharacterBuild {
  const next = clone(build);
  if (key.startsWith('subclass:')) {
    const entry = next.classes.find((c) => c.classKey === key.slice('subclass:'.length));
    if (entry) {
      if (selected[0]) entry.subclassKey = selected[0];
      else delete entry.subclassKey;
    }
    return next;
  }
  if (key.startsWith('asi:')) {
    const lvl = next.levels[Number(key.slice(4))];
    if (!lvl) return next;
    const feat = selected.find((v) => v.includes('/'));
    if (feat) lvl.asi = { kind: 'feat', featKey: feat };
    else if (!selected.length) delete lvl.asi;
    else {
      const increases: Partial<Record<Ability, 1 | 2>> = {};
      for (const v of selected.slice(0, 2)) {
        if (!(ABILITIES as readonly string[]).includes(v)) continue;
        const a = v as Ability;
        increases[a] = increases[a] === 1 ? 2 : 1;
      }
      lvl.asi = { kind: 'asi', increases };
    }
    return next;
  }
  if (key.startsWith('hp:')) {
    const lvl = next.levels[Number(key.slice(3))];
    const roll = Number(selected[0]);
    if (lvl && Number.isInteger(roll) && roll >= 1) lvl.hp = { method: 'roll', roll };
    return next;
  }
  if (key.startsWith('spells:')) {
    const [, classKey, part] = key.split(':');
    if (!classKey || !part) return next;
    let ks = next.knownSpells.find((k) => k.classKey === classKey);
    if (!ks) {
      ks = { classKey, cantrips: [], spells: [] };
      next.knownSpells.push(ks);
    }
    if (part === 'cantrips') ks.cantrips = [...selected];
    else if (part === 'known') ks.spells = [...selected];
    else if (part === 'spellbook') ks.spellbook = [...selected];
    return next;
  }
  if (selected.length) next.choices[key] = [...selected];
  else delete next.choices[key];
  return next;
}

/**
 * Удаляет выборы, ставшие недействительными (сменили расу, класс, предысторию, подкласс),
 * и лишние заклинания сверх лимитов. Повторяется, пока набор не стабилизируется
 * (вложенные выборы появляются только после выбора родителя).
 */
export function pruneChoices(build: CharacterBuild, content: ContentIndex, rules: CampaignSettings): CharacterBuild {
  let next = clone(build);
  for (let pass = 0; pass < 4; pass++) {
    const { sheet } = computeWithPipeline(next, emptyState(), content, rules);
    const valid = new Set(sheet.choices.filter((c) => c.kind === 'choice').map((c) => c.key));
    let changed = false;
    for (const k of Object.keys(next.choices)) {
      // Стартовое снаряжение хранится рядом с выборами, но не порождается умениями.
      if (k.startsWith('equipment:')) continue;
      if (!valid.has(k)) {
        delete next.choices[k];
        changed = true;
      }
    }
    const casters = new Map(sheet.spellcasting.classes.map((c) => [c.classKey, c]));
    const kept = next.knownSpells.filter((k) => casters.has(k.classKey) || next.classes.some((c) => c.classKey === k.classKey));
    if (kept.length !== next.knownSpells.length) changed = true;
    next.knownSpells = kept;
    if (!changed) break;
    next = clone(next);
  }
  return next;
}
