/** Тема: общие для сервера (класс `<html>` по cookie) и клиента константы. */
export type ThemeChoice = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

export const THEME_COOKIE = 'ps_theme';

/** Класс на `<html>`: `theme-system` раскрывается медиазапросом в globals.css. */
export const THEME_CLASS: Record<ThemeChoice, string> = {
  dark: 'dark',
  light: 'light',
  system: 'theme-system',
};

export function parseThemeChoice(value: string | undefined | null): ThemeChoice {
  return value === 'light' || value === 'system' ? value : 'dark';
}
