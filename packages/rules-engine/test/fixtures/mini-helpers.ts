import type {
  Ability,
  ClassData,
  ContentEntity,
  ContentKind,
  Effect,
  EntityDataByKind,
  Feature,
  SkillId,
} from '@ps/content-schema';

export const PACK = 'mini';
export const k = (kind: ContentKind, slug: string) => `${PACK}/${kind}/${slug}`;

export function feat(
  key: string,
  nameRu: string,
  level: number | undefined,
  effects: Effect[] = [],
  status?: Feature['effectsStatus'],
): Feature {
  const auto = effects.filter((e) => e.type !== 'text');
  return {
    key,
    nameRu,
    ...(level !== undefined ? { level } : {}),
    textMd: '',
    effects,
    effectsStatus: status ?? (auto.length === 0 ? 'text_only' : effects.some((e) => e.type === 'text') ? 'partial' : 'complete'),
  };
}

export function entity<K extends ContentKind>(
  kind: K,
  slug: string,
  nameRu: string,
  data: EntityDataByKind[K],
  nameEn?: string,
): ContentEntity<K> {
  return {
    key: k(kind, slug),
    kind,
    slug,
    nameRu,
    ...(nameEn ? { nameEn } : {}),
    data,
    effectsStatus: 'complete',
  } as ContentEntity<K>;
}

/** Таблица класса: колонки заданы массивами на 20 уровней. */
export function levelsTable(
  features: Feature[],
  columns: Record<string, (string | number)[]>,
): ClassData['levels'] {
  return Array.from({ length: 20 }, (_, i) => ({
    level: i + 1,
    featureKeys: features.filter((f) => f.level === i + 1).map((f) => f.key),
    values: Object.fromEntries(Object.entries(columns).map(([c, arr]) => [c, arr[i] ?? 0])),
  }));
}

/** Массив на 20 уровней из точек смены значения: {1: x, 5: y, ...}. */
export function steps(points: Record<number, string | number>): (string | number)[] {
  const out: (string | number)[] = [];
  let cur: string | number = 0;
  for (let l = 1; l <= 20; l++) {
    if (points[l] !== undefined) cur = points[l]!;
    out.push(cur);
  }
  return out;
}

export const prof = (target: string): Effect => ({ type: 'proficiency', target: target as never, level: 'proficient' });
export const text = (noteRu?: string): Effect => ({ type: 'text', ...(noteRu ? { noteRu } : {}) });
export const abilityAdd = (ability: Ability, n: number): Effect => ({ type: 'ability', ability, op: 'add', value: String(n) });
export const skillsChoice = (id: string, labelRu: string, n: number, from: SkillId[] | 'any', grant: 'proficient' | 'expertise' = 'proficient'): Effect => ({
  type: 'choice',
  id,
  labelRu,
  choose: n,
  options: { kind: 'skills', from, grant, ...(grant === 'expertise' ? { requireProficient: true } : {}) },
});

export const FIGHTING_STYLES: Record<string, { labelRu: string; effects: Effect[] }> = {
  archery: { labelRu: 'Стрельба', effects: [{ type: 'bonus', target: 'attack:ranged_weapon', value: '2', labelRu: 'Стрельба' }] },
  defense: {
    labelRu: 'Оборона',
    effects: [{ type: 'bonus', target: 'ac', value: '1', labelRu: 'Оборона', when: { not: { armor: 'none' } } }],
  },
  dueling: {
    labelRu: 'Дуэлянт',
    effects: [
      { type: 'bonus', target: 'damage:melee_weapon', value: '2', labelRu: 'Дуэлянт', when: { wielding: 'one_melee_weapon_no_other' } },
    ],
  },
  'great-weapon-fighting': {
    labelRu: 'Сражение большим оружием',
    effects: [{ type: 'combat_rule', rule: 'great_weapon_reroll', noteRu: 'Перебросить 1 и 2 на костях урона двуручного оружия' }],
  },
  protection: { labelRu: 'Защита', effects: [{ type: 'text', noteRu: 'Реакцией со щитом: помеха на атаку по союзнику рядом' }] },
  'two-weapon-fighting': {
    labelRu: 'Сражение двумя оружиями',
    effects: [{ type: 'combat_rule', rule: 'twf_ability_mod', noteRu: 'Модификатор характеристики к урону второго оружия' }],
  },
};

export function fightingStyleChoice(id: string, styles: string[]): Effect {
  return {
    type: 'choice',
    id,
    labelRu: 'Боевой стиль',
    choose: 1,
    options: {
      kind: 'list',
      items: styles.map((s) => ({ value: s, labelRu: FIGHTING_STYLES[s]!.labelRu, effects: FIGHTING_STYLES[s]!.effects })),
    },
  };
}
