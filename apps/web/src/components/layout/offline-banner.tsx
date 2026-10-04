'use client';
import { useSyncExternalStore } from 'react';
import { ru } from '@/i18n/ru';

function subscribe(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="bg-warning/20 px-4 py-2 text-center text-sm text-warning">
      {ru.common.offline}
    </div>
  );
}
