'use client';
import { useSyncExternalStore } from 'react';
import {
  THEME_CLASS,
  THEME_COOKIE,
  parseThemeChoice,
  type ResolvedTheme,
  type ThemeChoice,
} from './theme-shared';

/**
 * Тема оформления без провайдера контекста и без скрипта в `<head>`: выбор хранится в cookie,
 * класс на `<html>` ставит сервер (app/layout.tsx). Компоненты читают тему через
 * useSyncExternalStore, поэтому после гидратации не меняется ни один контекст над страницей
 * и лист не гидрируется одной длинной синхронной задачей (SPEC §16.5).
 */
export type { ResolvedTheme, ThemeChoice };

const CHANGE_EVENT = 'ps-theme-change';
const MEDIA = '(prefers-color-scheme: dark)';

function readChoice(): ThemeChoice {
  const m = document.cookie.match(new RegExp(`(?:^|; )${THEME_COOKIE}=([^;]*)`));
  return parseThemeChoice(m?.[1]);
}

function resolve(choice: ThemeChoice): ResolvedTheme {
  if (choice !== 'system') return choice;
  return window.matchMedia(MEDIA).matches ? 'dark' : 'light';
}

function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  // Без анимаций переходов на время смены темы.
  const style = document.createElement('style');
  style.appendChild(document.createTextNode('*,*::before,*::after{transition:none!important}'));
  document.head.appendChild(style);
  root.classList.remove(...Object.values(THEME_CLASS));
  root.classList.add(THEME_CLASS[choice]);
  void window.getComputedStyle(document.body).opacity;
  window.setTimeout(() => style.remove(), 1);
}

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(MEDIA);
  window.addEventListener(CHANGE_EVENT, onChange);
  media.addEventListener('change', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    media.removeEventListener('change', onChange);
  };
}

export function setTheme(value: string) {
  const choice = parseThemeChoice(value);
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${THEME_COOKIE}=${choice}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  applyTheme(choice);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Выбранный вариант (для настроек). */
export function useThemeChoice(serverChoice: ThemeChoice = 'dark'): ThemeChoice {
  return useSyncExternalStore(subscribe, readChoice, () => serverChoice);
}

/** Действующая тема: `system` раскрыт по настройке устройства. */
export function useResolvedTheme(serverTheme: ResolvedTheme = 'dark'): ResolvedTheme {
  return useSyncExternalStore(
    subscribe,
    () => resolve(readChoice()),
    () => serverTheme,
  );
}
