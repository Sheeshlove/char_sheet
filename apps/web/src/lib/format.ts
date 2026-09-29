import { ru } from '@/i18n/ru';

/** Цена в медных монетах → «15 зм», «5 см», «2 мм» (крупнейшая целая единица). */
export function formatCost(cp: number | undefined): string {
  if (cp === undefined || cp === null) return '—';
  if (cp === 0) return '—';
  if (cp % 100 === 0) return `${(cp / 100).toLocaleString('ru-RU')} зм`;
  if (cp % 10 === 0) return `${(cp / 10).toLocaleString('ru-RU')} см`;
  return `${cp.toLocaleString('ru-RU')} мм`;
}

export function formatWeight(lb: number | undefined): string {
  if (!lb) return '—';
  return `${lb.toLocaleString('ru-RU')} ${ru.library.lb}`;
}

/** Кость в русской записи: `1d8` → `1к8`. */
export function diceRu(s: string | undefined): string {
  return (s ?? '').replace(/d/g, 'к');
}

export function formatFeet(ft: number | undefined): string {
  return ft === undefined ? '—' : `${ft} ${ru.library.ft}`;
}
