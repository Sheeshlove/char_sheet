import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@/server/trpc/routers/_app';
import { createContext } from '@/server/trpc/context';
import { isSameOrigin } from '@/server/http/origin';

async function handler(req: Request) {
  // CSRF: мутации принимаются только с того же Origin, что APP_URL (SPEC §5.1).
  if (req.method === 'POST' && !isSameOrigin(req)) {
    return new Response(JSON.stringify({ error: 'FORBIDDEN' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
  }
  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext,
    onError({ error, path }) {
      if (error.code === 'INTERNAL_SERVER_ERROR') console.error(`tRPC ${path ?? '?'}:`, error);
    },
  });
}

export { handler as GET, handler as POST };
