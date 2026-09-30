import { clone } from '../util';
import type { CampaignSettings, CharacterBuild, CharacterState, StateCommand } from '@ps/content-schema';
import type { ContentIndex } from '../content-index';
import { compute } from '../compute';
import { startingInventory } from '../builder/starting';
import { CommandError, type ComputedSheet, type EngineEvent } from '../types';

function uid(state: CharacterState): string {
  let n = state.inventory.length + 1;
  const ids = new Set(state.inventory.map((i) => i.id));
  while (ids.has(`i${n}`)) n++;
  return `i${n}`;
}

function hasDefense(sheet: ComputedSheet, kind: 'resistances' | 'immunities' | 'vulnerabilities', type: string, magical: boolean) {
  return sheet.defenses[kind].some(
    (d) => d.damageType === type || (d.damageType === 'nonmagical_bps' && !magical && ['bludgeoning', 'piercing', 'slashing'].includes(type)),
  );
}

/** Сброс спасбросков от смерти. */
const resetDeathSaves = (s: CharacterState) => {
  s.deathSaves = { successes: 0, failures: 0, stable: false, dead: s.deathSaves.dead };
};

/**
 * Применение команды к актуальному состоянию (SPEC §8.10). Функция чистая: возвращает
 * новое состояние и события; ошибки команд — `CommandError`.
 */
export function applyCommand(
  build: CharacterBuild,
  state: CharacterState,
  cmd: StateCommand,
  content: ContentIndex,
  rules: CampaignSettings,
): { state: CharacterState; events: EngineEvent[] } {
  const sheet = compute(build, state, content, rules);
  const s: CharacterState = clone(state);
  const events: EngineEvent[] = [];
  const maxHp = sheet.hp.max.value;
  const setUnconscious = (on: boolean) => {
    const has = s.conditions.includes('unconscious');
    if (on && !has) s.conditions.push('unconscious');
    if (!on && has) s.conditions = s.conditions.filter((c) => c !== 'unconscious');
  };
  const die = () => {
    s.deathSaves.dead = true;
    s.hp.current = 0;
  };

  switch (cmd.type) {
    case 'damage': {
      if (s.deathSaves.dead) break;
      let amount = cmd.amount;
      if (cmd.damageType) {
        const magical = !!cmd.magical;
        if (hasDefense(sheet, 'immunities', cmd.damageType, magical)) amount = 0;
        else {
          if (hasDefense(sheet, 'resistances', cmd.damageType, magical)) amount = Math.floor(amount / 2);
          if (hasDefense(sheet, 'vulnerabilities', cmd.damageType, magical)) amount *= 2;
        }
      }
      if (amount <= 0) break;
      const wasZero = s.hp.current <= 0;
      const fromTemp = Math.min(s.hp.temp, amount);
      s.hp.temp -= fromTemp;
      let rest = amount - fromTemp;
      if (s.concentration && amount > 0) {
        events.push({ type: 'concentration_check', dc: Math.max(10, Math.floor(amount / 2)), spellKey: s.concentration.spellKey });
      }
      if (wasZero) {
        if (rest > 0) {
          // RULES-NOTE: урон при 0 хитов, не меньший максимума хитов, — мгновенная смерть (PHB, «Мгновенная смерть»).
          if (rest >= maxHp) {
            die();
            events.push({ type: 'died', reason: 'massive_damage' });
            break;
          }
          s.deathSaves.stable = false;
          s.deathSaves.failures = Math.min(3, s.deathSaves.failures + (cmd.critical ? 2 : 1));
          if (s.deathSaves.failures >= 3) {
            die();
            events.push({ type: 'died', reason: 'death_saves' });
          }
        }
        break;
      }
      if (rest >= s.hp.current) {
        rest -= s.hp.current;
        s.hp.current = 0;
        if (rest >= maxHp) {
          die();
          events.push({ type: 'died', reason: 'massive_damage' });
        } else {
          resetDeathSaves(s);
          setUnconscious(true);
          events.push({ type: 'dropped_to_zero' });
        }
      } else s.hp.current -= rest;
      break;
    }
    case 'heal': {
      if (s.deathSaves.dead || cmd.amount <= 0) break;
      const wasZero = s.hp.current <= 0;
      s.hp.current = Math.min(maxHp, Math.max(0, s.hp.current) + cmd.amount);
      if (wasZero) {
        resetDeathSaves(s);
        setUnconscious(false);
        events.push({ type: 'revived' });
      }
      break;
    }
    case 'set_temp_hp':
      // Временные хиты не складываются.
      s.hp.temp = Math.max(s.hp.temp, cmd.amount);
      break;
    case 'set_hp': {
      s.hp.current = Math.min(maxHp, Math.max(0, cmd.current));
      if (s.hp.current > 0) {
        resetDeathSaves(s);
        setUnconscious(false);
      }
      break;
    }
    case 'death_save': {
      if (s.deathSaves.dead) break;
      if (s.hp.current > 0) throw new CommandError('not_dying', 'Спасброски от смерти делают только при 0 хитов.');
      if (cmd.result === 'nat20') {
        s.hp.current = 1;
        resetDeathSaves(s);
        setUnconscious(false);
        events.push({ type: 'revived' });
        break;
      }
      if (s.deathSaves.stable) break;
      if (cmd.result === 'success') s.deathSaves.successes = Math.min(3, s.deathSaves.successes + 1);
      else s.deathSaves.failures = Math.min(3, s.deathSaves.failures + (cmd.result === 'nat1' ? 2 : 1));
      if (s.deathSaves.failures >= 3) {
        die();
        events.push({ type: 'died', reason: 'death_saves' });
      } else if (s.deathSaves.successes >= 3) {
        s.deathSaves.stable = true;
        events.push({ type: 'stabilized' });
      }
      break;
    }
    case 'spend_slot':
    case 'restore_slot': {
      const spend = cmd.type === 'spend_slot';
      if (cmd.pact) {
        const pact = sheet.spellcasting.pact;
        if (!pact || pact.level !== cmd.level) throw new CommandError('no_slot', 'Нет ячеек договора этого круга.');
        if (spend && s.pactSlotsUsed >= pact.max) throw new CommandError('no_slot', 'Все ячейки договора потрачены.');
        s.pactSlotsUsed = Math.max(0, Math.min(pact.max, s.pactSlotsUsed + (spend ? 1 : -1)));
      } else {
        const slot = sheet.spellcasting.slots.find((x) => x.level === cmd.level);
        if (!slot) throw new CommandError('no_slot', `Нет ячеек ${cmd.level} круга.`);
        while (s.slotsUsed.length <= cmd.level) s.slotsUsed.push(0);
        const used = s.slotsUsed[cmd.level] ?? 0;
        if (spend && used >= slot.max) throw new CommandError('no_slot', `Все ячейки ${cmd.level} круга потрачены.`);
        s.slotsUsed[cmd.level] = Math.max(0, Math.min(slot.max, used + (spend ? 1 : -1)));
      }
      break;
    }
    case 'use_resource':
    case 'restore_resource': {
      const r = sheet.resources.find((x) => x.id === cmd.id);
      if (!r) throw new CommandError('no_resource', 'Нет такого ресурса.');
      const n = cmd.amount ?? 1;
      const used = s.resourcesUsed[cmd.id] ?? 0;
      if (cmd.type === 'use_resource') {
        if (used + n > r.max) throw new CommandError('resource_empty', `${r.nameRu}: не хватает зарядов.`);
        s.resourcesUsed[cmd.id] = used + n;
      } else s.resourcesUsed[cmd.id] = Math.max(0, used - n);
      break;
    }
    case 'use_grant': {
      const g = sheet.spellcasting.grants.find((x) => x.id === cmd.id);
      if (!g) throw new CommandError('no_grant', 'Нет такого заклинания.');
      if (!g.uses) break;
      if (g.uses.used >= g.uses.max) throw new CommandError('grant_empty', `${g.nameRu}: использования закончились.`);
      s.grantUsesUsed[cmd.id] = g.uses.used + 1;
      break;
    }
    case 'set_toggle': {
      const t = sheet.toggles.find((x) => x.id === cmd.id);
      if (!t) throw new CommandError('no_toggle', 'Нет такого переключателя.');
      if (cmd.on && !t.active) {
        if (t.cost) {
          const r = sheet.resources.find((x) => x.id === t.cost!.resource);
          const used = s.resourcesUsed[t.cost.resource] ?? 0;
          if (!r || used + t.cost.amount > r.max) throw new CommandError('resource_empty', `${t.labelRu}: не хватает ресурса.`);
          s.resourcesUsed[t.cost.resource] = used + t.cost.amount;
        }
        if (t.exclusiveGroup) {
          const others = sheet.toggles.filter((x) => x.exclusiveGroup === t.exclusiveGroup && x.id !== t.id).map((x) => x.id);
          s.toggles = s.toggles.filter((x) => !others.includes(x));
        }
        s.toggles.push(t.id);
      } else if (!cmd.on) s.toggles = s.toggles.filter((x) => x !== cmd.id);
      break;
    }
    case 'add_condition':
      if (sheet.defenses.conditionImmunities.includes(cmd.condition)) {
        throw new CommandError('condition_immune', 'Иммунитет к этому состоянию.');
      }
      if (cmd.condition === 'exhaustion') s.exhaustion = Math.min(6, s.exhaustion + 1);
      else if (!s.conditions.includes(cmd.condition)) s.conditions.push(cmd.condition);
      break;
    case 'remove_condition':
      if (cmd.condition === 'exhaustion') s.exhaustion = Math.max(0, s.exhaustion - 1);
      else s.conditions = s.conditions.filter((c) => c !== cmd.condition);
      break;
    case 'set_exhaustion':
      s.exhaustion = cmd.level;
      if (cmd.level >= 6) {
        die();
        events.push({ type: 'died', reason: 'exhaustion' });
      }
      break;
    case 'concentrate':
      if (s.concentration && s.concentration.spellKey !== cmd.spellKey) {
        events.push({ type: 'concentration_ended', spellKey: s.concentration.spellKey });
      }
      s.concentration = { spellKey: cmd.spellKey, sinceIso: new Date().toISOString() };
      break;
    case 'drop_concentration':
      if (s.concentration) events.push({ type: 'concentration_ended', spellKey: s.concentration.spellKey });
      delete s.concentration;
      s.toggles = s.toggles.filter((t) => !t.startsWith('spell:'));
      break;
    case 'short_rest': {
      const con = sheet.abilities.con.mod;
      for (const hd of cmd.hitDice) {
        const pool = sheet.hitDice.find((x) => x.die === hd.die);
        const key = `d${hd.die}` as keyof CharacterState['hitDiceUsed'];
        if (!pool || s.hitDiceUsed[key] >= pool.total) throw new CommandError('no_hit_dice', `Нет свободных костей к${hd.die}.`);
        if (hd.roll < 1 || hd.roll > hd.die) throw new CommandError('bad_roll', `Бросок к${hd.die} вне диапазона.`);
        s.hitDiceUsed[key] += 1;
        s.hp.current = Math.min(maxHp, Math.max(0, s.hp.current) + Math.max(0, hd.roll + con));
      }
      if (s.hp.current > 0) {
        setUnconscious(false);
        resetDeathSaves(s);
      }
      for (const r of sheet.resources) if (r.reset === 'short') s.resourcesUsed[r.id] = 0;
      for (const g of sheet.spellcasting.grants) if (g.uses?.reset === 'short') s.grantUsesUsed[g.id] = 0;
      s.pactSlotsUsed = 0;
      break;
    }
    // RULES-NOTE: долгий отдых всегда снижает истощение на 1 и снимает концентрацию.
    case 'long_rest': {
      if (s.deathSaves.dead) break;
      s.hp.current = maxHp;
      s.hp.temp = 0;
      // Вернуть max(1, floor(всего/2)) костей, начиная с крупных.
      const totalDice = sheet.hitDice.reduce((n, x) => n + x.total, 0);
      let back = Math.max(1, Math.floor(totalDice / 2));
      for (const hd of [...sheet.hitDice].sort((a, b) => b.die - a.die)) {
        const key = `d${hd.die}` as keyof CharacterState['hitDiceUsed'];
        const r = Math.min(back, s.hitDiceUsed[key]);
        s.hitDiceUsed[key] -= r;
        back -= r;
      }
      s.slotsUsed = s.slotsUsed.map(() => 0);
      s.pactSlotsUsed = 0;
      for (const r of sheet.resources) if (r.reset === 'short' || r.reset === 'long') s.resourcesUsed[r.id] = 0;
      s.grantUsesUsed = {};
      s.exhaustion = Math.max(0, s.exhaustion - 1);
      s.deathSaves = { successes: 0, failures: 0, stable: false, dead: false };
      setUnconscious(false);
      if (s.concentration) events.push({ type: 'concentration_ended', spellKey: s.concentration.spellKey });
      delete s.concentration;
      s.toggles = s.toggles.filter((t) => !t.startsWith('spell:'));
      break;
    }
    case 'new_day': {
      for (const r of sheet.resources) if (r.reset === 'dawn') s.resourcesUsed[r.id] = 0;
      for (const g of sheet.spellcasting.grants) if (g.uses?.reset === 'dawn') s.grantUsesUsed[g.id] = 0;
      for (const item of s.inventory) {
        const ent = content.getOf(item.key, 'item');
        if (ent?.data.charges?.reset === 'dawn') {
          const max = Number(ent.data.charges.max);
          if (Number.isFinite(max)) item.charges = max;
        }
      }
      break;
    }
    case 'gain_xp':
      s.xp = Math.max(0, s.xp + cmd.amount);
      if (compute(build, s, content, rules).xp.canLevelUp) events.push({ type: 'level_up_available' });
      break;
    case 'set_xp':
      s.xp = cmd.xp;
      break;
    case 'set_currency':
      s.currency = { ...cmd.currency };
      break;
    case 'add_currency': {
      for (const k of ['cp', 'sp', 'ep', 'gp', 'pp'] as const) {
        const v = s.currency[k] + (cmd.currency[k] ?? 0);
        if (v < 0) throw new CommandError('not_enough_money', 'Не хватает монет.');
        s.currency[k] = v;
      }
      break;
    }
    case 'inventory_add': {
      const item = { ...cmd.item, id: uid(s) };
      if (item.key && !content.has(item.key) && !item.customName) {
        throw new CommandError('unknown_item', 'Предмет не найден в справочнике.');
      }
      s.inventory.push(item);
      break;
    }
    case 'inventory_update': {
      const item = s.inventory.find((i) => i.id === cmd.id);
      if (!item) throw new CommandError('no_item', 'Предмет не найден.');
      Object.assign(item, cmd.patch);
      if (cmd.patch.equipped === false && item.hand) delete item.hand;
      break;
    }
    case 'inventory_remove': {
      const idx = s.inventory.findIndex((i) => i.id === cmd.id);
      if (idx < 0) throw new CommandError('no_item', 'Предмет не найден.');
      const item = s.inventory[idx]!;
      if (cmd.qty !== undefined && cmd.qty < item.qty) item.qty -= cmd.qty;
      else {
        s.inventory.splice(idx, 1);
        for (const i of s.inventory) if (i.containerId === item.id) delete i.containerId;
      }
      break;
    }
    case 'set_prepared':
      s.prepared[cmd.classKey] = [...new Set(cmd.spells)];
      break;
    case 'set_inspiration':
      s.inspiration = cmd.value;
      break;
    case 'set_charges': {
      const item = s.inventory.find((i) => i.id === cmd.id);
      if (!item) throw new CommandError('no_item', 'Предмет не найден.');
      item.charges = cmd.charges;
      break;
    }
  }
  return { state: s, events };
}

/** Начальное состояние для готовой сборки: полные хиты. */
export function initialState(
  build: CharacterBuild,
  base: CharacterState,
  content: ContentIndex,
  rules: CampaignSettings,
): CharacterState {
  const s = clone(base);
  const sheet = compute(build, s, content, rules);
  s.hp.current = sheet.hp.max.value;
  return s;
}

/**
 * Состояние после сохранения сборки: при завершении конструктора — стартовое снаряжение
 * и полные хиты; у готового персонажа изменение максимума хитов (повышение уровня,
 * Телосложение) двигает текущие хиты на ту же величину.
 */
export function stateAfterBuildChange(
  prevBuild: CharacterBuild,
  prevState: CharacterState,
  nextBuild: CharacterBuild,
  content: ContentIndex,
  rules: CampaignSettings,
): CharacterState {
  if (nextBuild.status !== 'ready') return prevState;
  if (prevBuild.status === 'draft') return initialState(nextBuild, startingInventory(nextBuild, prevState, content), content, rules);
  if (prevState.deathSaves.dead) return prevState;
  const before = compute(prevBuild, prevState, content, rules).hp.max.value;
  const after = compute(nextBuild, prevState, content, rules).hp.max.value;
  if (after === before) return prevState;
  // RULES-NOTE: RAW прямо говорит только о повышении уровня (максимум растёт — растут и
  // текущие); то же правило применяется к любому изменению максимума, в т. ч. к уменьшению.
  const s = clone(prevState);
  s.hp.current = Math.max(0, Math.min(after, s.hp.current + after - before));
  return s;
}

