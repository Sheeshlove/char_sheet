import Link from 'next/link';
import { ru } from '@/i18n/ru';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">{ru.errors.notFoundTitle}</h1>
      <Button asChild variant="outline">
        <Link href="/">{ru.nav.home}</Link>
      </Button>
    </main>
  );
}
