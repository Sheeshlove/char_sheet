/** Ячейки заклинаний по уровню заклинателя (SPEC §8.9). Строка = уровень 1..20, столбцы = круги 1..9. */
export const SPELL_SLOTS: readonly (readonly number[])[] = [
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

/** Ячейки по кругам 1..9 (массив длины 9) для уровня заклинателя. */
export function slotsForCasterLevel(casterLevel: number): number[] {
  const row = casterLevel >= 1 ? (SPELL_SLOTS[Math.min(20, casterLevel) - 1] ?? []) : [];
  return Array.from({ length: 9 }, (_, i) => row[i] ?? 0);
}

/** Магия договора колдуна: число ячеек и их круг. */
export function pactSlots(warlockLevel: number): { count: number; level: number } {
  if (warlockLevel <= 0) return { count: 0, level: 0 };
  if (warlockLevel === 1) return { count: 1, level: 1 };
  if (warlockLevel === 2) return { count: 2, level: 1 };
  if (warlockLevel <= 4) return { count: 2, level: 2 };
  if (warlockLevel <= 6) return { count: 2, level: 3 };
  if (warlockLevel <= 8) return { count: 2, level: 4 };
  if (warlockLevel <= 10) return { count: 2, level: 5 };
  if (warlockLevel <= 16) return { count: 3, level: 5 };
  return { count: 4, level: 5 };
}

export type Progression = 'full' | 'half' | 'half_up' | 'third' | 'pact';

/** Уровень класса, с которого класс — заклинатель (умение «Использование заклинаний»). */
export function defaultSpellcastingStart(p: Progression): number {
  switch (p) {
    case 'half':
      return 2;
    case 'third':
      return 3;
    default:
      return 1;
  }
}

/** «Эффективный» уровень заклинателя одного класса (как если бы он был единственным). */
export function singleClassCasterLevel(p: Progression, classLevel: number): number {
  switch (p) {
    case 'full':
      return classLevel;
    case 'half':
      return classLevel >= 2 ? Math.ceil(classLevel / 2) : 0;
    case 'half_up':
      return Math.ceil(classLevel / 2);
    case 'third':
      return classLevel >= 3 ? Math.ceil(classLevel / 3) : 0;
    case 'pact':
      return 0;
  }
}

/** Вклад класса в уровень заклинателя при мультиклассе. */
export function multiclassCasterContribution(p: Progression, classLevel: number): number {
  switch (p) {
    case 'full':
      return classLevel;
    case 'half':
      return Math.floor(classLevel / 2);
    case 'half_up':
      return Math.ceil(classLevel / 2);
    case 'third':
      return Math.floor(classLevel / 3);
    case 'pact':
      return 0;
  }
}

/** Максимальный круг заклинаний для класса (как если бы он был единственным). */
export function maxSpellLevelFor(p: Progression, classLevel: number): number {
  if (p === 'pact') return pactSlots(classLevel).level;
  const slots = slotsForCasterLevel(singleClassCasterLevel(p, classLevel));
  let max = 0;
  slots.forEach((n, i) => {
    if (n > 0) max = i + 1;
  });
  return max;
}
