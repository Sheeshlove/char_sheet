import type {
  ArmorData,
  ContentEntity,
  DamageType,
  Effect,
  GearData,
  MagicItemData,
  WeaponData,
} from '@ps/content-schema';
import { paragraphs, toCp } from '../util/text';
import type { Translator } from './dict';
import type { SrdEquipment, SrdMagicItem } from './types';

export const PACK = 'srd';
export const key = (kind: string, slug: string) => `${PACK}/${kind}/${slug}`;

const PROP_MAP: Record<string, WeaponData['properties'][number]> = {
  ammunition: 'ammunition',
  finesse: 'finesse',
  heavy: 'heavy',
  light: 'light',
  loading: 'loading',
  reach: 'reach',
  special: 'special',
  thrown: 'thrown',
  'two-handed': 'two_handed',
  versatile: 'versatile',
};

function base<K extends ContentEntity['kind']>(kind: K, slug: string, nameRu: string, nameEn: string, textMd = '') {
  return {
    key: key(kind, slug),
    kind,
    slug,
    nameRu,
    nameEn,
    sourceBook: 'SRD 5.1',
    textMd,
    effectsStatus: 'complete' as const,
  };
}

export type EquipmentIndex = Map<string, { kind: 'weapon' | 'armor' | 'gear' | 'tool'; key: string }>;

export function convertEquipment(list: SrdEquipment[], tr: Translator): { entities: ContentEntity[]; index: EquipmentIndex } {
  const entities: ContentEntity[] = [];
  const index: EquipmentIndex = new Map();
  for (const e of list) {
    const nameRu = tr.t('equipment', e.index, e.name);
    const text = paragraphs(e.desc);
    const cat = e.equipment_category.index;
    if (cat === 'weapon') {
      const props = (e.properties ?? []).map((p) => PROP_MAP[p.index]).filter((x): x is WeaponData['properties'][number] => !!x);
      const category = e.weapon_category === 'Martial' ? 'martial' : 'simple';
      const range = e.weapon_range === 'Ranged' ? 'ranged' : 'melee';
      const data: WeaponData = {
        category,
        range,
        // Оружие без урона (сеть): кость «—», атака без урона.
        damage: e.damage ? { dice: e.damage.damage_dice, type: e.damage.damage_type.index as DamageType } : { dice: '—', type: 'bludgeoning' },
        properties: props,
        costCp: toCp(e.cost),
        weightLb: e.weight ?? 0,
        // Оружие монаха: короткий меч и простое рукопашное без «двуручного» и «тяжёлого» (PHB).
        monkWeapon:
          e.index === 'shortsword' ||
          (category === 'simple' && range === 'melee' && !props.includes('two_handed') && !props.includes('heavy')),
      };
      if (e.two_handed_damage) data.versatileDice = e.two_handed_damage.damage_dice;
      if (range === 'ranged' && e.range?.long) data.rangeFt = { normal: e.range.normal, long: e.range.long };
      else if (e.throw_range) data.rangeFt = { normal: e.throw_range.normal, long: e.throw_range.long };
      entities.push({ ...base('weapon', e.index, nameRu, e.name, text), data });
      index.set(e.index, { kind: 'weapon', key: key('weapon', e.index) });
    } else if (cat === 'armor' && e.armor_class) {
      const category = (e.armor_category ?? 'Light').toLowerCase() as ArmorData['category'];
      const data: ArmorData = {
        category,
        baseAc: e.armor_class.base,
        dexCap: category === 'shield' ? null : !e.armor_class.dex_bonus ? 0 : (e.armor_class.max_bonus ?? null),
        stealthDisadvantage: !!e.stealth_disadvantage,
        costCp: toCp(e.cost),
        weightLb: e.weight ?? 0,
      };
      if (e.str_minimum && e.str_minimum > 0) data.strRequirement = e.str_minimum;
      entities.push({ ...base('armor', e.index, nameRu, e.name, text), data });
      index.set(e.index, { kind: 'armor', key: key('armor', e.index) });
    } else if (cat === 'tools') {
      const tc = e.tool_category ?? '';
      const toolGroup: GearData['toolGroup'] = /artisan/i.test(tc)
        ? 'artisan'
        : /musical/i.test(tc)
          ? 'musical'
          : /gaming/i.test(tc)
            ? 'gaming'
            : 'other';
      const data: GearData = { costCp: toCp(e.cost), weightLb: e.weight ?? 0, kind: 'tool', toolGroup };
      entities.push({ ...base('tool', e.index, nameRu, e.name, text), data });
      index.set(e.index, { kind: 'tool', key: key('tool', e.index) });
    } else {
      const gc = e.gear_category?.index;
      let kind: GearData['kind'] = 'gear';
      if (gc === 'ammunition') kind = 'ammunition';
      else if (gc === 'equipment-packs') kind = 'pack';
      else if (gc === 'arcane-foci' || gc === 'druidic-foci' || gc === 'holy-symbols') kind = 'focus';
      else if (cat === 'mounts-and-vehicles' && /mount/i.test(e.vehicle_category ?? '')) kind = 'mount';
      const data: GearData = { costCp: toCp(e.cost), weightLb: e.weight ?? 0, kind };
      const focus = { 'arcane-foci': 'arcane', 'druidic-foci': 'druidic', 'holy-symbols': 'holy' } as const;
      if (gc && gc in focus) data.focusGroup = focus[gc as keyof typeof focus];
      if (e.capacity) {
        const m = /([\d,]+)\s*lb/.exec(e.capacity);
        if (m) data.capacityLb = Number(m[1]!.replace(/,/g, ''));
      }
      if (e.contents?.length) data.contents = e.contents.map((c) => ({ key: key('gear', c.item.index), qty: c.quantity }));
      entities.push({ ...base('gear', e.index, nameRu, e.name, text), data });
      index.set(e.index, { kind: 'gear', key: key('gear', e.index) });
    }
  }
  // Содержимое наборов: ссылки на реальные виды сущностей.
  for (const e of entities) {
    if (e.kind === 'gear' && e.data.contents) {
      e.data.contents = e.data.contents.map((c) => {
        const slug = c.key.split('/').pop()!;
        return { key: index.get(slug)?.key ?? c.key, qty: c.qty };
      });
    }
  }
  return { entities, index };
}

const RARITY: Record<string, MagicItemData['rarity']> = {
  common: 'common',
  uncommon: 'uncommon',
  rare: 'rare',
  'very rare': 'very_rare',
  legendary: 'legendary',
  artifact: 'artifact',
  varies: 'varies',
};

const ITEM_TYPE: Record<string, MagicItemData['itemType']> = {
  weapon: 'weapon',
  armor: 'armor',
  'wondrous-items': 'wondrous',
  ring: 'ring',
  rod: 'rod',
  staff: 'staff',
  wand: 'wand',
  potion: 'potion',
  scroll: 'scroll',
  ammunition: 'ammunition',
};

/**
 * Магические предметы. Автоматически извлекаются только бонусы «+N» оружия/доспехов/боеприпасов;
 * остальное — текст (эффекты добавляются оверлеями, SPEC §7.6).
 */
export function convertMagicItems(list: SrdMagicItem[], tr: Translator, eq: EquipmentIndex): ContentEntity[] {
  const out: ContentEntity[] = [];
  const seen = new Set<string>();
  for (const m of list) {
    if (seen.has(m.index)) continue;
    seen.add(m.index);
    const nameRu = tr.t('magicItems', m.name, m.name);
    const head = m.desc[0] ?? '';
    const attunementMatch = /\(requires attunement(?: by ([^)]+))?\)/i.exec(head);
    const rarity = RARITY[m.rarity.name.toLowerCase()] ?? 'varies';
    let itemType = ITEM_TYPE[m.equipment_category.index] ?? 'wondrous';
    if (itemType === 'armor' && /shield/i.test(m.name)) itemType = 'shield';
    const effects: Effect[] = [];
    let baseItem: MagicItemData['baseItem'];
    const plus = /,\s*\+(\d)$/.exec(m.name);
    if (plus && !m.variants?.length) {
      const n = plus[1]!;
      if (/^Weapon/.test(m.name)) {
        baseItem = { anyOf: 'any_weapon' };
        effects.push(
          { type: 'bonus', target: 'attack:melee_weapon', value: n },
          { type: 'bonus', target: 'attack:ranged_weapon', value: n },
          { type: 'bonus', target: 'damage:melee_weapon', value: n },
          { type: 'bonus', target: 'damage:ranged_weapon', value: n },
        );
      } else if (/^Armor/.test(m.name)) {
        baseItem = { anyOf: 'any_armor' };
        effects.push({ type: 'bonus', target: 'ac', value: n });
      } else if (/^Ammunition/.test(m.name)) {
        baseItem = { anyOf: 'ammunition' };
        effects.push({ type: 'text', noteRu: `+${n} к броскам атаки и урона этими боеприпасами` });
      }
    } else {
      const armorBase = /^Armor \(([^)]+)\)/i.exec(head)?.[1]?.toLowerCase();
      if (armorBase) {
        const slug = armorBase.includes('plate') && !armorBase.includes('half') ? 'plate-armor' : undefined;
        if (slug && eq.has(slug)) baseItem = eq.get(slug)!.key;
        else if (/medium or heavy/.test(armorBase)) baseItem = { anyOf: 'medium_or_heavy_armor' };
        else if (/light/.test(armorBase)) baseItem = { anyOf: 'light_armor' };
        else if (eq.has(armorBase.replace(/\s+/g, '-'))) baseItem = eq.get(armorBase.replace(/\s+/g, '-'))!.key;
        else baseItem = { anyOf: 'any_armor' };
      }
      const weaponBase = /^Weapon \(([^)]+)\)/i.exec(head)?.[1]?.toLowerCase();
      if (weaponBase) {
        if (/sword/.test(weaponBase)) baseItem = { anyOf: 'any_sword' };
        else if (/axe/.test(weaponBase)) baseItem = { anyOf: 'any_axe' };
        else if (eq.has(weaponBase.replace(/\s+/g, '-'))) baseItem = eq.get(weaponBase.replace(/\s+/g, '-'))!.key;
        else baseItem = { anyOf: 'any_weapon' };
      }
    }
    const data: MagicItemData = {
      itemType,
      rarity,
      attunement: attunementMatch ? (attunementMatch[1] ? { byRu: attunementMatch[1] } : {}) : false,
      effects,
      effectsStatus: effects.length && effects.every((e) => e.type !== 'text') ? 'complete' : effects.length ? 'partial' : 'text_only',
    };
    if (baseItem) data.baseItem = baseItem;
    out.push({
      key: key('item', m.index),
      kind: 'item',
      slug: m.index,
      nameRu,
      nameEn: m.name,
      sourceBook: 'SRD 5.1',
      textMd: paragraphs(m.desc),
      effectsStatus: data.effectsStatus,
      data,
    });
  }
  return out;
}
