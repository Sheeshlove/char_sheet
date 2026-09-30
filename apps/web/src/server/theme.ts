import { cookies } from 'next/headers';
import { parseThemeChoice, THEME_COOKIE, type ResolvedTheme, type ThemeChoice } from '@/lib/theme-shared';

/** Выбранная тема из cookie (для класса `<html>` и начального значения клиентских хуков). */
export async function getThemeChoice(): Promise<ThemeChoice> {
  return parseThemeChoice((await cookies()).get(THEME_COOKIE)?.value);
}

/** Тема для серверного рендера: «как в системе» сервер не знает — считаем тёмной. */
export function serverResolvedTheme(choice: ThemeChoice): ResolvedTheme {
  return choice === 'light' ? 'light' : 'dark';
}
