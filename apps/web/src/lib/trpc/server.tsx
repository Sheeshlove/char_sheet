import { cache } from 'react';
import { headers } from 'next/headers';
import { defaultShouldDehydrateQuery, dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import superjson from 'superjson';
import { appRouter } from '@/server/trpc/routers/_app';
import { clientIp, secureCookiesEnabled, type Context } from '@/server/trpc/context';
import { getCurrentUser } from '@/server/auth/current';
import { getDb } from '@/server/db/client';

/**
 * Предзагрузка tRPC-запросов в серверных компонентах: данные попадают в HTML и
 * гидрируются в кэш клиента — первый экран рисуется без лишнего запроса (SPEC §16.5).
 * Процедуры вызываются те же, со всеми гардами прав.
 */
export const getServerQueryClient = cache(
  () =>
    new QueryClient({
      defaultOptions: {
        queries: { staleTime: 5_000 },
        dehydrate: {
          serializeData: superjson.serialize,
          shouldDehydrateQuery: (q) => defaultShouldDehydrateQuery(q),
        },
      },
    }),
);

async function createServerContext(): Promise<Context> {
  const h = await headers();
  return {
    db: getDb(),
    user: await getCurrentUser(),
    session: null,
    ip: clientIp(h),
    userAgent: h.get('user-agent') ?? '',
    resHeaders: null,
    secureCookies: secureCookiesEnabled(),
  };
}

export const serverTrpc = createTRPCOptionsProxy({
  ctx: createServerContext,
  router: appRouter,
  queryClient: getServerQueryClient,
});

export function HydrateClient({ children }: { children: React.ReactNode }) {
  return <HydrationBoundary state={dehydrate(getServerQueryClient())}>{children}</HydrationBoundary>;
}
