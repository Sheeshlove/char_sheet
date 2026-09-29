'use client';
import * as React from 'react';
import { QueryClient, QueryClientProvider, MutationCache } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink, TRPCClientError } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import superjson from 'superjson';
import { toast } from 'sonner';
import type { AppRouter } from '@/server/trpc/routers/_app';
import { errorMessage, ru } from '@/i18n/ru';

export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();

/** Текст ошибки tRPC для пользователя: ключ из `message` или код. */
export function trpcErrorText(err: unknown): string {
  if (err instanceof TRPCClientError) {
    const msg = err.message;
    const text = errorMessage(msg);
    if (text !== ru.errors.INTERNAL_SERVER_ERROR || msg === 'INTERNAL_SERVER_ERROR') return text;
    const code = (err.data as { code?: string } | undefined)?.code;
    return errorMessage(code);
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) return ru.errors.network;
  return ru.errors.INTERNAL_SERVER_ERROR;
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5_000,
        refetchOnWindowFocus: true,
        retry: (count, err) => {
          if (err instanceof TRPCClientError) {
            const code = (err.data as { code?: string } | undefined)?.code;
            if (code && ['UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'BAD_REQUEST'].includes(code)) return false;
          }
          return count < 2;
        },
      },
      mutations: {
        networkMode: 'always',
      },
    },
    mutationCache: new MutationCache({
      onError: (err, _vars, _ctx, mutation) => {
        if (mutation.meta?.silent) return;
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          toast.error(ru.errors.offlineMutation);
          return;
        }
        toast.error(trpcErrorText(err));
      },
    }),
  });
}

export function TRPCReactProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(makeQueryClient);
  const [trpcClient] = React.useState(() =>
    createTRPCClient<AppRouter>({
      links: [httpBatchLink({ url: '/api/trpc', transformer: superjson })],
    }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
