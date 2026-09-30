'use client';
import { useEffect, useState } from 'react';

/**
 * `true`, когда браузер освободился после первого рендера/гидратации. Запросы, которые можно
 * отложить, включаются по нему: обновления кэша запросов в React синхронные и иначе заставляют
 * гидрировать весь лист одной длинной задачей (SPEC §16.5).
 */
export function useIdleReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(() => setReady(true), { timeout: 1500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(() => setReady(true), 200);
    return () => window.clearTimeout(id);
  }, []);
  return ready;
}
