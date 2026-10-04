import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from '@/components/providers';
import { ru } from '@/i18n/ru';
import { THEME_CLASS } from '@/lib/theme-shared';
import { getThemeChoice } from '@/server/theme';
import './globals.css';

const inter = Inter({ subsets: ['latin', 'cyrillic'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: { default: ru.app.name, template: `%s · ${ru.app.name}` },
  description: ru.app.tagline,
  applicationName: ru.app.name,
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: ru.app.shortName, statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  themeColor: '#1c1814',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Класс темы — по cookie на сервере: без скрипта в <head> и без мигания (SPEC §16.5).
  const theme = await getThemeChoice();
  return (
    <html lang="ru" className={`${inter.variable} ${THEME_CLASS[theme]}`} suppressHydrationWarning>
      <body className="min-h-dvh font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
