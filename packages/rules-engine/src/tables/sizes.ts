import type { Size } from '@ps/content-schema';

export const SIZE_ORDER: Size[] = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'];

/** Множитель грузоподъёмности (SPEC §8.6). */
export const CARRY_MULTIPLIER: Record<Size, number> = {
  tiny: 0.5,
  small: 1,
  medium: 1,
  large: 2,
  huge: 4,
  gargantuan: 8,
};

export function shiftSize(size: Size, steps: number): Size {
  const i = SIZE_ORDER.indexOf(size);
  return SIZE_ORDER[Math.max(0, Math.min(SIZE_ORDER.length - 1, i + steps))]!;
}
