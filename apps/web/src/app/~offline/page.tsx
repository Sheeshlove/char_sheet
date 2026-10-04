import Link from 'next/link';
import { WifiOffIcon } from 'lucide-react';
import { ru } from '@/i18n/ru';

export const metadata = { title: ru.app.offlineTitle };

/** Запасная страница service worker, когда страницы нет в кэше и нет сети. */
export default function OfflinePage() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-md content-center gap-4 p-6 text-center">
      <WifiOffIcon className="mx-auto size-10 text-muted-foreground" aria-hidden />
      <h1 className="text-2xl font-semibold">{ru.app.offlineTitle}</h1>
      <p className="text-sm text-muted-foreground">{ru.app.offlineText}</p>
      <Link href="/" className="text-primary underline underline-offset-2">
        {ru.app.offlineHome}
      </Link>
    </main>
  );
}
