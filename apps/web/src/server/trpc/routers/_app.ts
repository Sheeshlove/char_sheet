import { publicProcedure, router } from '../init';
import { authRouter } from './auth';
import { adminRouter } from './admin';

export const appRouter = router({
  /** Гард: публичный доступ (проверка живости). */
  health: publicProcedure.query(() => ({ ok: true as const })),
  auth: authRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
