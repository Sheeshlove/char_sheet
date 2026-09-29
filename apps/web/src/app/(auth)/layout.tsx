import Link from 'next/link';
import { ru } from '@/i18n/ru';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-4">
      <Link href="/" className="text-2xl font-bold tracking-tight">
        {ru.app.name}
      </Link>
      <div className="w-full max-w-sm">{children}</div>
      <p className="max-w-sm text-center text-xs text-muted-foreground">{ru.app.tagline}</p>
    </main>
  );
}
