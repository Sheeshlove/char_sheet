import type { Ability, ContentEntity, DamageType, SpellData } from '@ps/content-schema';
import { paragraphs } from '../util/text';
import type { Translator } from './dict';
import { key } from './convert-equipment';
import type { SrdSpell, SrdSpellDamage } from './types';

function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

const UNITS: Record<string, [string, string, string]> = {
  round: ['раунд', 'раунда', 'раундов'],
  minute: ['минута', 'минуты', 'минут'],
  hour: ['час', 'часа', 'часов'],
  day: ['день', 'дня', 'дней'],
  year: ['год', 'года', 'лет'],
};
const UNITS_GEN: Record<string, [string, string, string]> = {
  round: ['раунда', 'раундов', 'раундов'],
  minute: ['минуты', 'минут', 'минут'],
  hour: ['часа', 'часов', 'часов'],
  day: ['дня', 'дней', 'дней'],
};

function amountUnit(s: string, genitive = false): string | null {
  const m = /^(\d+)\s+(round|minute|hour|day|year)s?$/i.exec(s.trim());
  if (!m) return null;
  const n = Number(m[1]);
  const table = genitive ? UNITS_GEN : UNITS;
  const forms = table[m[2]!.toLowerCase()] ?? UNITS[m[2]!.toLowerCase()]!;
  return `${n} ${genitive && n === 1 ? forms[0] : plural(n, forms)}`;
}

export function castingTime(s: string): SpellData['castingTime'] {
  const t = s.trim();
  if (/^1 action/i.test(t)) return { textRu: '1 действие', unit: 'action', amount: 1 };
  if (/^1 bonus action/i.test(t)) return { textRu: '1 бонусное действие', unit: 'bonus_action', amount: 1 };
  if (/^1 reaction/i.test(t)) return { textRu: '1 реакция', unit: 'reaction', amount: 1 };
  const m = /^(\d+)\s+(minute|hour)s?/i.exec(t);
  if (m) {
    const unit = m[2]!.toLowerCase() as 'minute' | 'hour';
    return { textRu: amountUnit(`${m[1]} ${unit}`)!, unit, amount: Number(m[1]) };
  }
  return { textRu: t, unit: 'special', amount: 0 };
}

export function spellRange(s: string): SpellData['range'] {
  const t = s.trim();
  if (/^Self/i.test(t)) {
    const shape: Record<string, string> = { cone: 'конус', line: 'линия', cube: 'куб', sphere: 'сфера', radius: 'радиус' };
    const m = /\((\d+)[- ](foot|mile)[- ]?(cone|line|cube|sphere|radius)?/i.exec(t);
    if (m) {
      const unit = m[2]!.toLowerCase() === 'mile' ? 'миль' : 'футов';
      const sh = shape[(m[3] ?? 'radius').toLowerCase()] ?? 'радиус';
      return { textRu: `На себя (${sh} ${m[1]} ${unit})`, kind: 'self' };
    }
    return { textRu: 'На себя', kind: 'self' };
  }
  if (/^Touch/i.test(t)) return { textRu: 'Касание', kind: 'touch' };
  if (/^Sight/i.test(t)) return { textRu: 'В пределах видимости', kind: 'sight' };
  if (/^Unlimited/i.test(t)) return { textRu: 'Неограниченная', kind: 'unlimited' };
  const feet = /^(\d+)\s*feet/i.exec(t);
  if (feet) return { textRu: `${feet[1]} футов`, feet: Number(feet[1]), kind: 'ranged' };
  const miles = /^(\d+)\s*miles?/i.exec(t);
  if (miles) {
    const n = Number(miles[1]);
    return { textRu: `${n} ${plural(n, ['миля', 'мили', 'миль'])}`, feet: n * 5280, kind: 'ranged' };
  }
  return { textRu: t === 'Special' ? 'Особая' : t, kind: 'special' };
}

export function duration(s: string, concentration: boolean): SpellData['duration'] {
  const t = s.trim();
  const up = /^Up to (.+)$/i.exec(t);
  if (up) {
    const inner = amountUnit(up[1]!, true) ?? up[1]!;
    return { textRu: `${concentration ? 'Концентрация, вплоть до' : 'Вплоть до'} ${inner}`, concentration };
  }
  const map: Record<string, string> = {
    Instantaneous: 'Мгновенная',
    'Until dispelled': 'Пока не рассеется',
    'Until dispelled or triggered': 'Пока не рассеется или не сработает',
    Special: 'Особая',
  };
  if (map[t]) return { textRu: map[t]!, concentration };
  return { textRu: amountUnit(t) ?? t, concentration };
}

function firstDice(table: Record<string, string> | undefined): string | undefined {
  if (!table) return undefined;
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  const v = table[String(keys[0])];
  return v ? /(\d+d\d+)/.exec(v)?.[1] : undefined;
}

export function convertSpells(list: SrdSpell[], tr: Translator): ContentEntity[] {
  return list.map((s) => {
    const damages = (Array.isArray(s.damage) ? s.damage : s.damage ? [s.damage] : []) as SrdSpellDamage[];
    const damage: NonNullable<SpellData['damage']> = [];
    for (const d of damages) {
      if (!d.damage_type) continue;
      const slotDice = firstDice(d.damage_at_slot_level);
      const charDice = firstDice(d.damage_at_character_level);
      const dice = slotDice ?? charDice;
      if (!dice) continue;
      // RULES-NOTE: «Мистический заряд» — больше лучей, а не больше костей: без масштабирования.
      const scaling = slotDice ? 'slot' : s.index === 'eldritch-blast' ? undefined : 'cantrip';
      damage.push({ dice, type: d.damage_type.index as DamageType, ...(scaling ? { scaling } : {}) });
    }
    const m = s.material ?? '';
    const cost = /(\d[\d,]*)\s*gp/i.exec(m);
    const data: SpellData = {
      level: s.level,
      school: s.school.index as SpellData['school'],
      castingTime: castingTime(s.casting_time),
      ritual: s.ritual,
      range: spellRange(s.range),
      components: {
        v: s.components.includes('V'),
        s: s.components.includes('S'),
        m: s.components.includes('M'),
        ...(m ? { materialRu: m } : {}),
        ...(cost ? { costGp: Number(cost[1]!.replace(/,/g, '')) } : {}),
        ...(/consume/i.test(m) ? { consumed: true } : {}),
      },
      duration: duration(s.duration, s.concentration),
      classes: s.classes.map((c) => c.index),
      subclasses: s.subclasses.map((c) => key('subclass', c.index)),
    };
    if (s.attack_type) data.attack = s.attack_type;
    if (s.dc) data.save = s.dc.dc_type.index as Ability;
    if (damage.length) data.damage = damage;
    const heal = firstDice(s.heal_at_slot_level);
    if (heal) {
      const raw = Object.values(s.heal_at_slot_level ?? {})[0] ?? '';
      data.heal = { dice: heal, addSpellMod: /MOD/.test(raw), scaling: 'slot' };
    }
    if (s.higher_level?.length) data.higherLevelsMd = paragraphs(s.higher_level);
    return {
      key: key('spell', s.index),
      kind: 'spell' as const,
      slug: s.index,
      nameRu: tr.t('spells', s.name, s.name),
      nameEn: s.name,
      sourceBook: 'SRD 5.1',
      textMd: paragraphs(s.desc) + (s.higher_level?.length ? `\n\n**На больших уровнях.** ${paragraphs(s.higher_level)}` : ''),
      effectsStatus: 'complete' as const,
      data,
    };
  });
}
