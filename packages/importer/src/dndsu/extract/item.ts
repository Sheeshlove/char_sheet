import type { Effect, MagicItemData, SkillId } from '@ps/content-schema';
import { findTerm, findTermIds, norm, parseCount, type TermDictionary } from '../terms';
import { matchName } from './class';

type BaseAnyOf = Extract<NonNullable<MagicItemData['baseItem']>, { anyOf: string }>['anyOf'];

function baseFromParen(paren: string, names: Map<string, string>): MagicItemData['baseItem'] | undefined {
  const t = norm(paren);
  const any = (a: BaseAnyOf) => ({ anyOf: a });
  if (/любой\s+меч|любое\s+.*меч/.test(t)) return any('any_sword');
  if (/любой\s+топор|любая\s+секира|топор/.test(t) && /любо/.test(t)) return any('any_axe');
  if (/любое\s+оружие|любое/.test(t) && !/доспех/.test(t)) return any('any_weapon');
  if (/средний\s+или\s+тяж/.test(t)) return any('medium_or_heavy_armor');
  if (/л[её]гкий/.test(t) && /доспех/.test(t)) return any('light_armor');
  if (/любой\s+доспех|доспех/.test(t) && /любо/.test(t)) return any('any_armor');
  if (/боеприпас/.test(t)) return any('ammunition');
  const slug = matchName(t, names);
  return slug ? slug : undefined;
}

/**
 * Строка типа предмета: «Оружие (длинный меч), редкое (требуется настройка)»,
 * «Чудесный предмет, необычный», «Доспех (латы), легендарный (требуется настройка паладином)».
 * `names` — RU-название базового предмета → ключ сущности.
 */
export function parseItemTypeLine(
  line: string | undefined,
  names: Map<string, string>,
  dict?: TermDictionary,
): Pick<MagicItemData, 'itemType' | 'rarity' | 'attunement' | 'baseItem'> | null {
  if (!line) return null;
  const t = norm(line);
  const itemType = findTerm('itemTypes', line, dict) as MagicItemData['itemType'] | undefined;
  const rarities = findTermIds('rarity', line, dict) as MagicItemData['rarity'][];
  if (!itemType || !rarities.length) return null;
  const rarity = rarities.length > 1 ? 'varies' : rarities[0]!;
  const att = /требуется\s+настройка(?:\s+([^)]+))?/i.exec(line);
  const attunement: MagicItemData['attunement'] = att ? (att[1]?.trim() ? { byRu: att[1].trim() } : {}) : false;
  const out: Pick<MagicItemData, 'itemType' | 'rarity' | 'attunement' | 'baseItem'> = { itemType, rarity, attunement };
  const firstParen = /^[^(,]*\(([^)]+)\)/.exec(line);
  if (firstParen && !/настройк/i.test(firstParen[1]!) && (itemType === 'weapon' || itemType === 'armor' || itemType === 'ammunition')) {
    const base = baseFromParen(firstParen[1]!, names);
    if (base) out.baseItem = base;
  }
  if (itemType === 'armor' && /щит/.test(t) && !/доспех/.test(t)) out.itemType = 'shield';
  return out;
}

/** «+1 к броскам атаки и урона», «+2 к КД», «N зарядов … на рассвете». */
export function parseItemMechanics(
  md: string,
  itemType: MagicItemData['itemType'],
): { effects: Effect[]; charges?: MagicItemData['charges'] } {
  const effects: Effect[] = [];
  const t = norm(md);
  const atk = /(?:получаете\s+)?бонус\s+\+(\d)\s+к\s+броскам\s+атаки\s+и\s+(?:броскам\s+)?урона/.exec(t) ?? /\+(\d)\s+к\s+броскам\s+атаки\s+и\s+(?:броскам\s+)?урона/.exec(t);
  if (atk && itemType === 'weapon') {
    const n = atk[1]!;
    effects.push(
      { type: 'bonus', target: 'attack:melee_weapon', value: n },
      { type: 'bonus', target: 'attack:ranged_weapon', value: n },
      { type: 'bonus', target: 'damage:melee_weapon', value: n },
      { type: 'bonus', target: 'damage:ranged_weapon', value: n },
    );
  } else if (atk && itemType === 'ammunition') {
    effects.push({ type: 'text', noteRu: `+${atk[1]} к броскам атаки и урона этими боеприпасами` });
  }
  const ac = /(?:бонус\s+)?\+(\d)\s+к\s+(?:кд|классу\s+доспеха)/.exec(t);
  if (ac && (itemType === 'armor' || itemType === 'shield' || itemType === 'ring' || itemType === 'wondrous')) {
    effects.push({ type: 'bonus', target: 'ac', value: ac[1]! });
  }
  let charges: MagicItemData['charges'];
  const ch = /(\d+|\p{L}+)\s+заряд/iu.exec(md);
  const max = ch ? parseCount(ch[1]!) : undefined;
  if (max) {
    const rech = /[^.]*восстанавлива\S*[^.]*заряд[^.]*\./iu.exec(md)?.[0]?.trim() ?? '';
    const r = norm(rech);
    const reset: NonNullable<MagicItemData['charges']>['reset'] = /рассвет/.test(r)
      ? 'dawn'
      : /длительн\S*\s+отдых/.test(r)
        ? 'long'
        : /коротк\S*\s+отдых/.test(r)
          ? 'short'
          : 'none';
    charges = { max: String(max), rechargeRu: rech, reset };
  }
  return { effects, charges };
}

/** Навыки предыстории: «Проницательность, Религия». */
export function parseBackgroundSkills(s: string | undefined, dict?: TermDictionary): SkillId[] {
  return s ? (findTermIds('skills', s, dict) as SkillId[]) : [];
}

/** Языки предыстории: «Два на ваш выбор» → { choose: 2 }; иначе список id. */
export function parseBackgroundLanguages(
  s: string | undefined,
  dict?: TermDictionary,
): { choose: number } | string[] {
  if (!s || /^нет/i.test(s.trim())) return [];
  const c = /^(\p{L}+|\d+)[^,]*на\s+ваш\s+выбор/iu.exec(s.trim());
  const n = c ? parseCount(c[1]!) : undefined;
  if (n) return { choose: n };
  return findTermIds('languages', s, dict);
}

/** Золото из снаряжения: «…и поясной кошель с 15 зм». */
export function parseGold(s: string | undefined): number {
  const m = s ? /(\d+)\s*зм/.exec(s) : null;
  return m ? Number(m[1]) : 0;
}
