/// <reference lib="webworker" />
import { defaultCache } from '@serwist/turbopack/worker';
import { ExpirationPlugin, NetworkFirst, Serwist, type PrecacheEntry, type SerwistGlobalConfig } from 'serwist';

/**
 * Service worker (SPEC §16.4): статика из прекэша, последние открытые листы и бандл
 * контента — «сначала сеть, без сети — последняя копия». Мутации (POST) не кэшируются.
 */

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      // Лист персонажа: `characters.get` идёт отдельным GET-запросом (без батча), адрес постоянный.
      matcher: ({ url, request, sameOrigin }) =>
        sameOrigin && request.method === 'GET' && url.pathname === '/api/trpc/characters.get',
      handler: new NetworkFirst({
        cacheName: 'sheets',
        networkTimeoutSeconds: 4,
        plugins: [new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 30 * 24 * 60 * 60 })],
      }),
    },
    {
      matcher: ({ url, request, sameOrigin }) => sameOrigin && request.method === 'GET' && url.pathname === '/api/content/bundle',
      handler: new NetworkFirst({
        cacheName: 'content-bundle',
        networkTimeoutSeconds: 6,
        plugins: [new ExpirationPlugin({ maxEntries: 8 })],
      }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [{ url: '/~offline', matcher: ({ request }) => request.destination === 'document' }],
  },
});

serwist.addEventListeners();
