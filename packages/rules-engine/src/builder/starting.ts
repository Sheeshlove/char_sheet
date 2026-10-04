import type { CharacterBuild, CharacterState, InventoryItem } from '@ps/content-schema';
import type { ContentIndex } from '../content-index';
import { clone } from '../util';

/** Ключ выбора стартового снаряжения: группа класса → индекс варианта. */
export const EQUIPMENT_CHOICE_PREFIX = 'equipment:';
/** Ключ стартового золота вместо снаряжения (SPEC §9 шаг 5). */
export const STARTING_GOLD_KEY = 'equipment:gold';

export type StartingEquipmentItem = {
  key: string;
  qty: number;
  nameRu: string;
  /** Предмет категории «на выбор» (`any:simple-weapons`): ключ выбора и варианты. */
  choiceKey?: string;
  options?: { key: string; nameRu: string }[];
};

export type StartingEquipmentGroup = {
  key: string;
  options: { index: number; items: StartingEquipmentItem[] }[];
};

/** Категории стартового снаряжения «на выбор» из 5e-database. */
export const EQUIPMENT_CATEGORY_LABEL_RU: Record<string, string> = {
  'simple-weapons': 'Простое оружие на выбор',
  'simple-melee-weapons': 'Простое рукопашное оружие на выбор',
  'martial-weapons': 'Воинское оружие на выбор',
  'martial-melee-weapons': 'Воинское рукопашное оружие на выбор',
  'holy-symbols': 'Священный символ на выбор',
  'arcane-foci': 'Магическая фокусировка на выбор',
  'druidic-foci': 'Друидическая фокусировка на выбор',
  'musical-instruments': 'Музыкальный инструмент на выбор',
};

/** Предметы категории «на выбор». */
export function equipmentCategoryItems(category: string, content: ContentIndex): { key: string; nameRu: string }[] {
  const byName = (a: { nameRu: string }, b: { nameRu: string }) => a.nameRu.localeCompare(b.nameRu, 'ru');
  const weapons = (cat: 'simple' | 'martial', melee: boolean) =>
    content
      .byKind('weapon')
      .filter((w) => w.data.category === cat && (!melee || w.data.range === 'melee'))
      .map((w) => ({ key: w.key, nameRu: w.nameRu }));
  const focus = (g: 'arcane' | 'druidic' | 'holy') =>
    content
      .byKind('gear')
      .filter((x) => x.data.focusGroup === g)
      .map((x) => ({ key: x.key, nameRu: x.nameRu }));
  const list =
    category === 'simple-weapons'
      ? weapons('simple', false)
      : category === 'simple-melee-weapons'
        ? weapons('simple', true)
        : category === 'martial-weapons'
          ? weapons('martial', false)
          : category === 'martial-melee-weapons'
            ? weapons('martial', true)
            : category === 'holy-symbols'
              ? focus('holy')
              : category === 'arcane-foci'
                ? focus('arcane')
                : category === 'druidic-foci'
                  ? focus('druidic')
                  : category === 'musical-instruments'
                    ? content
                        .byKind('tool')
                        .filter((t) => t.data.toolGroup === 'musical')
                        .map((t) => ({ key: t.key, nameRu: t.nameRu }))
                    : [];
  return list.sort(byName);
}

/** Группы «a или b» стартового снаряжения первого класса. */
export function startingEquipmentGroups(build: CharacterBuild, content: ContentIndex): StartingEquipmentGroup[] {
  const first = build.classes[0];
  const cls = first ? content.getOf(first.classKey, 'class') : undefined;
  if (!cls) return [];
  return cls.data.startingEquipment.map((g, gi) => {
    const key = `${EQUIPMENT_CHOICE_PREFIX}${first!.classKey}#${gi}`;
    return {
      key,
      options: g.options.map((o, index) => ({
        index,
        items: o.items.map((it, ii): StartingEquipmentItem => {
          if (it.key.startsWith('any:')) {
            const category = it.key.slice(4);
            return {
              ...it,
              nameRu: EQUIPMENT_CATEGORY_LABEL_RU[category] ?? category,
              choiceKey: `${key}:${index}:${ii}`,
              options: equipmentCategoryItems(category, content),
            };
          }
          return { ...it, nameRu: content.get(it.key)?.nameRu ?? it.key };
        }),
      })),
    };
  });
}

/**
 * Начальный инвентарь и монеты при завершении конструктора: выбранные варианты групп
 * (или стартовое золото) + золото предыстории. Наборы снаряжения раскрываются в содержимое.
 */
export function startingInventory(build: CharacterBuild, state: CharacterState, content: ContentIndex): CharacterState {
  const next = clone(state);
  const add = (key: string, qty: number) => {
    const ent = content.get(key);
    const pack = ent?.kind === 'gear' && ent.data.kind === 'pack' ? ent.data.contents : undefined;
    if (pack?.length) {
      for (const c of pack) add(c.key, c.qty * qty);
      return;
    }
    const existing = next.inventory.find((i) => i.key === key && !i.equipped);
    if (existing) {
      existing.qty += qty;
      return;
    }
    let n = next.inventory.length + 1;
    while (next.inventory.some((i) => i.id === `i${n}`)) n++;
    const item: InventoryItem = { id: `i${n}`, key, qty, equipped: false, attuned: false };
    next.inventory.push(item);
  };
  const gold = Number(build.choices[STARTING_GOLD_KEY]?.[0]);
  if (Number.isFinite(gold) && gold > 0) next.currency.gp += Math.floor(gold);
  else {
    for (const g of startingEquipmentGroups(build, content)) {
      const idx = Number(build.choices[g.key]?.[0]);
      const opt = g.options.find((o) => o.index === idx);
      for (const it of opt?.items ?? []) {
        if (!it.choiceKey) add(it.key, it.qty);
        else {
          // Предмет «на выбор» добавляется, только если игрок выбрал конкретный.
          const chosen = build.choices[it.choiceKey]?.[0];
          if (chosen && it.options?.some((o) => o.key === chosen)) add(chosen, it.qty);
        }
      }
    }
  }
  const bg = build.background ? content.getOf(build.background, 'background') : undefined;
  if (bg) next.currency.gp += bg.data.gold;
  return next;
}
