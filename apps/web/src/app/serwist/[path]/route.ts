import { randomUUID } from 'node:crypto';
import { createSerwistRoute } from '@serwist/turbopack';

/**
 * Сборка service worker при `next build` (Turbopack): `/serwist/sw.js` отдаётся статически.
 * Ревизия офлайн-страницы — id сборки, чтобы после обновления кэш обновился.
 */
const revision = process.env.BUILD_ID ?? randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  additionalPrecacheEntries: [{ url: '/~offline', revision }],
  swSrc: 'src/app/sw.ts',
  useNativeEsbuild: true,
});
