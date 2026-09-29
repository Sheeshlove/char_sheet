import type { Ability, DamageType, EffectOf, WeaponFilter } from '@ps/content-schema';
import { maxDice, parseDice, cantripMultiplier, scaleDice } from '../dice';
import type { AttackLine, ComputedSheet, DamageLine, RollModeInfo, ValPart } from '../types';
import { makeVal, type AttackEvalCtx, type Pipeline, type SourceCtx, type WieldedWeapon } from './context';
import { bonusParts, labelOf, modesFor } from './helpers';
import { isWeaponProficient } from './collect';

const PROPERTY_LABEL_RU: Record<string, string> = {
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

function matchesFilter(f: WeaponFilter, w: WieldedWeapon | null): boolean {
  if (!w) return !!f.includeUnarmed;
  const d = w.data;
  if (f.category && d.category !== f.category) return false;
  if (f.range && d.range !== f.range) return false;
  if (f.properties && !f.properties.every((x) => d.properties.includes(x as (typeof d.properties)[number]))) return false;
  if (f.notProperties && f.notProperties.some((x) => d.properties.includes(x as (typeof d.properties)[number]))) return false;
  if (f.monkWeapon !== undefined && d.monkWeapon !== f.monkWeapon) return false;
  if (f.keys && !(w.baseSlug && f.keys.includes(w.baseSlug))) return false;
  return true;
}

function weaponOptions(p: Pipeline, w: WieldedWeapon | null): { effect: EffectOf<'weapon_option'>; src: SourceCtx }[] {
  return p.active('weapon_option').filter((o) => matchesFilter(o.effect.filter, w));
}

function bestAbility(p: Pipeline, abilities: Ability[]): Ability {
  let best = abilities[0]!;
  for (const a of abilities) if (p.abilities![a].mod > p.abilities![best].mod) best = a;
  return best;
}

function attackModes(p: Pipeline, ranged: boolean, spell = false): RollModeInfo[] {
  return modesFor(p, ['attack:*', spell ? 'attack:spell' : ranged ? 'attack:ranged_weapon' : 'attack:melee_weapon']);
}

function weaponLine(p: Pipeline, w: WieldedWeapon): AttackLine {
  const d = w.data;
  const ranged = d.range === 'ranged';
  const options = weaponOptions(p, w);
  const cands: Ability[] = ranged ? ['dex'] : ['str'];
  if (d.properties.includes('finesse')) cands.push(ranged ? 'str' : 'dex');
  for (const o of options) for (const a of o.effect.allowAbilities ?? []) cands.push(a);
  const ability = bestAbility(p, [...new Set(cands)]);
  const mod = p.abilities![ability].mod;
  const proficient = isWeaponProficient(new Set(p.profs.keys()), w);
  const ctx: AttackEvalCtx = { ability, weapon: w, ranged };
  const kind = ranged ? 'ranged_weapon' : 'melee_weapon';

  const hit: ValPart[] = [{ labelRu: `Модификатор характеристики`, value: mod }];
  if (proficient) hit.push({ labelRu: 'Владение', value: p.pb });
  if (w.magicBonus) hit.push({ labelRu: 'Магический бонус', value: w.magicBonus });
  hit.push(...bonusParts(p, [`attack:${kind}`], ctx));

  const others = p.equipment.weapons.filter((x) => x.itemId !== w.itemId);
  let dice = d.damage.dice;
  const twoHanded = w.hand === 'both' && !p.equipment.hasShield && others.length === 0;
  if (d.versatileDice && twoHanded) dice = d.versatileDice;
  for (const o of options) {
    if (!o.effect.minDamageDie) continue;
    const v = p.dice(o.effect.minDamageDie, o.src);
    if (typeof v === 'string' && parseDice(v)) dice = maxDice(dice, v);
  }

  const offHand = w.hand === 'off';
  const twfMod = p.active('combat_rule').some((r) => r.effect.rule === 'twf_ability_mod');
  let dmgMod = mod;
  if (offHand && mod > 0 && !twfMod) dmgMod = 0;
  const dmgBonus = [...bonusParts(p, [`damage:${kind}`], ctx)];
  const bonus = dmgMod + w.magicDamageBonus + dmgBonus.reduce((s, x) => s + x.value, 0);

  const notes: string[] = [];
  if (!proficient) notes.push('Нет владения: бонус мастерства не добавляется');
  if (offHand) notes.push(twfMod ? 'Второе оружие (бонусное действие)' : 'Второе оружие: положительный модификатор к урону не добавляется');
  for (const b of dmgBonus) notes.push(`Урон: ${b.labelRu} ${b.value >= 0 ? '+' : ''}${b.value}`);
  if (d.versatileDice && !twoHanded) notes.push(`Двумя руками: ${d.versatileDice}`);

  return {
    id: `weapon:${w.itemId}`,
    nameRu: w.nameRu,
    kind: 'weapon',
    itemId: w.itemId,
    ability,
    proficient,
    toHit: makeVal(hit),
    damage: [{ dice, bonus, type: d.damage.type }],
    reachFt: ranged ? undefined : d.properties.includes('reach') ? 10 : 5,
    rangeFt: d.rangeFt,
    properties: d.properties.map((x) => PROPERTY_LABEL_RU[x] ?? x),
    notes,
    modes: attackModes(p, ranged),
    bonusAction: offHand || undefined,
  };
}

function unarmedLine(p: Pipeline): AttackLine {
  const options = weaponOptions(p, null);
  const cands: Ability[] = ['str'];
  for (const o of options) for (const a of o.effect.allowAbilities ?? []) cands.push(a);
  const ability = bestAbility(p, [...new Set(cands)]);
  const mod = p.abilities![ability].mod;
  const ctx: AttackEvalCtx = { ability, unarmed: true };
  const hit: ValPart[] = [
    { labelRu: 'Модификатор характеристики', value: mod },
    { labelRu: 'Владение', value: p.pb },
    ...bonusParts(p, ['attack:melee_weapon'], ctx),
  ];
  let dice = '';
  for (const { effect, src } of p.active('unarmed_damage')) {
    const v = p.dice(effect.dice, src);
    if (typeof v === 'string' && parseDice(v)) dice = dice ? maxDice(dice, v) : v;
  }
  for (const o of options) {
    if (!o.effect.minDamageDie) continue;
    const v = p.dice(o.effect.minDamageDie, o.src);
    if (typeof v === 'string' && parseDice(v)) dice = dice ? maxDice(dice, v) : v;
  }
  const extra = bonusParts(p, ['damage:melee_weapon'], ctx).reduce((s, x) => s + x.value, 0);
  const bonus = (dice ? 0 : 1) + mod + extra;
  return {
    id: 'unarmed',
    nameRu: 'Безоружный удар',
    kind: 'unarmed',
    ability,
    proficient: true,
    toHit: makeVal(hit),
    damage: [{ dice, bonus, type: 'bludgeoning' }],
    reachFt: 5,
    properties: [],
    notes: [],
    modes: attackModes(p, false),
  };
}

function effectLine(p: Pipeline, effect: EffectOf<'attack'>, src: SourceCtx): AttackLine {
  let ability: Ability;
  if (effect.ability === 'str_or_dex') ability = bestAbility(p, ['str', 'dex']);
  else if (effect.ability === 'spell') ability = p.spellcastingAbility(src.classKey) ?? bestAbility(p, ['int', 'wis', 'cha']);
  else ability = effect.ability;
  const mod = p.abilities![ability].mod;
  const ranged = !!effect.rangeFt && !effect.reachFt;
  const ctx: AttackEvalCtx = { ability, ranged };
  const target = effect.ability === 'spell' ? 'attack:spell' : ranged ? 'attack:ranged_weapon' : 'attack:melee_weapon';
  const hit: ValPart[] = [{ labelRu: 'Модификатор характеристики', value: mod }];
  if (effect.proficient) hit.push({ labelRu: 'Владение', value: p.pb });
  hit.push(...bonusParts(p, [target], ctx));
  const damage: DamageLine[] = effect.damage.map((d) => {
    const v = p.dice(d.dice, src);
    const dice = typeof v === 'string' ? v : '';
    const flat = typeof v === 'number' ? v : 0;
    return { dice, bonus: flat + (d.addAbilityMod ? mod : 0), type: d.type };
  });
  return {
    id: `effect:${src.sourceKey}#${effect.id}`,
    nameRu: effect.nameRu,
    kind: 'effect',
    ability,
    proficient: effect.proficient,
    toHit: makeVal(hit),
    damage,
    reachFt: effect.reachFt,
    rangeFt: effect.rangeFt,
    properties: [],
    notes: [labelOf(src)],
    modes: attackModes(p, ranged, effect.ability === 'spell'),
  };
}

/** Строки атак заклинаниями (заговоры масштабируются по уровню персонажа). */
export function spellAttackLines(p: Pipeline, spellcasting: ComputedSheet['spellcasting']): AttackLine[] {
  const out: AttackLine[] = [];
  // RULES-NOTE: масштабируются только заговоры с scaling 'cantrip' (у «Мистического заряда» растёт число лучей).
  const mult = cantripMultiplier(p.totalLevel);
  const seen = new Set<string>();
  const add = (spellKey: string, dc: ComputedSheet['spellcasting']['classes'][number]['dc'], attack: ComputedSheet['spellcasting']['classes'][number]['attack'], ability: Ability, origin: string) => {
    const s = p.content.getOf(spellKey, 'spell');
    if (!s || (!s.data.attack && !s.data.save)) return;
    const id = `spell:${origin}:${spellKey}`;
    if (seen.has(spellKey)) return;
    seen.add(spellKey);
    const damage: DamageLine[] = (s.data.damage ?? []).map((d) => ({
      dice: d.scaling === 'cantrip' ? scaleDice(d.dice, mult) : d.dice,
      bonus: 0,
      type: d.type as DamageType,
    }));
    out.push({
      id,
      nameRu: s.nameRu,
      kind: 'spell',
      spellKey,
      spellLevel: s.data.level,
      ability,
      proficient: true,
      toHit: s.data.attack ? attack : undefined,
      saveDc: s.data.save ? dc : undefined,
      saveAbility: s.data.save,
      damage,
      rangeFt: s.data.range.feet ? { normal: s.data.range.feet, long: s.data.range.feet } : undefined,
      properties: [],
      notes: s.data.level > 0 && s.data.damage?.some((d) => d.scaling === 'slot') ? ['Усиливается ячейкой выше'] : [],
      modes: s.data.attack ? attackModes(p, s.data.attack === 'ranged', true) : [],
    });
  };
  for (const c of spellcasting.classes) {
    for (const sp of c.spells) {
      if (sp.level === 0 || sp.prepared || sp.alwaysPrepared) add(sp.key, c.dc, c.attack, c.ability, c.classKey);
    }
  }
  for (const g of spellcasting.grants) {
    const ab = g.ability ?? 'cha';
    const mod = p.abilities![ab].mod;
    const dc = makeVal([
      { labelRu: 'Базовое значение', value: 8 },
      { labelRu: 'Бонус мастерства', value: p.pb },
      { labelRu: 'Модификатор характеристики', value: mod },
    ]);
    const atk = makeVal([
      { labelRu: 'Бонус мастерства', value: p.pb },
      { labelRu: 'Модификатор характеристики', value: mod },
    ]);
    add(g.spellKey, dc, atk, ab, g.id);
  }
  return out;
}

/** Стадия 10: атаки (SPEC §8.8). */
export function computeAttacks(p: Pipeline): { attacks: AttackLine[]; attacksPerAction: number; critMin: number } {
  const attacks: AttackLine[] = [];
  for (const w of p.equipment.weapons) attacks.push(weaponLine(p, w));
  attacks.push(unarmedLine(p));
  const seen = new Set<string>();
  for (const { effect, src } of p.active('attack')) {
    if (seen.has(effect.id)) continue;
    seen.add(effect.id);
    attacks.push(effectLine(p, effect, src));
  }
  const extra = p.active('extra_attack').reduce((m, x) => Math.max(m, x.effect.attacks), 0);
  const crit = p.active('crit_range').reduce((m, x) => Math.min(m, x.effect.min), 20);
  return { attacks, attacksPerAction: 1 + extra, critMin: Math.min(20, crit) };
}
