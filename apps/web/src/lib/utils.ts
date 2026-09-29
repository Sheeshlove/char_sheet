import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Формат знака модификатора: +3, −1, +0. */
export function signed(n: number): string {
  return n >= 0 ? `+${n}` : `−${Math.abs(n)}`;
}

const dateFmt = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' });
const dateTimeFmt = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '';
  return dateFmt.format(typeof d === 'string' ? new Date(d) : d);
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return '';
  return dateTimeFmt.format(typeof d === 'string' ? new Date(d) : d);
}

/** Русское склонение по числу: plural(3, ['день','дня','дней']). */
export function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}
