import { ru } from '@/i18n/ru';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-3xl font-bold">{ru.app.name}</h1>
      <p className="text-muted-foreground">{ru.app.tagline}</p>
    </main>
  );
}
