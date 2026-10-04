'use client';
import { ru } from '@/i18n/ru';
import { trpcErrorText } from '@/lib/trpc/client';
import { Skeleton } from '@/components/ui/skeleton';

/** Единое отображение загрузки и ошибки запроса. */
export function QueryState({
  isLoading,
  error,
  children,
}: {
  isLoading: boolean;
  error: unknown;
  children: React.ReactNode;
}) {
  if (isLoading)
    return (
      <div className="grid gap-3" aria-busy="true" aria-label={ru.common.loading}>
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  if (error)
    return (
      <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        {trpcErrorText(error)}
      </div>
    );
  return <>{children}</>;
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">{children}</p>;
}
