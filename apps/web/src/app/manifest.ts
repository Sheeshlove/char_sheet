import type { MetadataRoute } from 'next';
import { ru } from '@/i18n/ru';

/** Манифест PWA (SPEC §16.4): название, иконки, тёмная тема. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: ru.app.name,
    short_name: ru.app.shortName,
    description: ru.app.tagline,
    lang: 'ru',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#1c1814',
    theme_color: '#1c1814',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
